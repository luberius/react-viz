import React, { useEffect, useRef, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import * as d3 from "d3";
import { GraphViewProps, D3Node } from "../types/project";
import "./GraphView.css";

// Define ELK node and edge types
interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
  // Additional data from our application
  data?: D3Node;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }[];
}

interface ElkGraph {
  id: string;
  children: ElkNode[];
  edges: ElkEdge[];
}

export const GraphView: React.FC<GraphViewProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<D3Node | null>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    const width = 800;
    const height = 600;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const g = svg.append("g");

    // Prepare data for ELK
    const nodes: D3Node[] = Object.values(data.nodesMap);

    // Create ELK graph structure
    const elkNodes: ElkNode[] = nodes.map((node) => ({
      id: node.id,
      width: 120, // Fixed width for node
      height: 50, // Fixed height for node
      data: node,
    }));

    const elkEdges: ElkEdge[] = [];
    nodes.forEach((node) => {
      node.imports?.forEach((importPath, index) => {
        if (data.nodesMap[importPath]) {
          elkEdges.push({
            id: `${node.id}_to_${importPath}_${index}`,
            sources: [node.id],
            targets: [importPath],
          });
        }
      });
    });

    const elkGraph: ElkGraph = {
      id: "root",
      children: elkNodes,
      edges: elkEdges,
    };

    // Configure ELK
    const elk = new ELK();

    // ELK layout options
    const options = {
      algorithm: "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
    };

    // Perform layout calculation
    elk
      .layout(elkGraph, { layoutOptions: options })
      .then((layoutedGraph) => {
        // Define node color based on type
        const nodeColor = (d: D3Node) => {
          switch (d.type) {
            case "component":
              return "#4a90e2";
            case "state":
              return "#e67e22";
            case "util":
              return "#2ecc71";
            default:
              return "#95a5a6";
          }
        };

        // Create edges
        const links = g
          .append("g")
          .selectAll("path")
          .data(layoutedGraph.edges || [])
          .join("path")
          .attr("class", "graph-link")
          .attr("d", (edge) => {
            if (edge.sections && edge.sections.length > 0) {
              const section = edge.sections[0];
              let path = `M ${section.startPoint.x} ${section.startPoint.y}`;

              // Add bend points if they exist
              if (section.bendPoints) {
                section.bendPoints.forEach((point) => {
                  path += ` L ${point.x} ${point.y}`;
                });
              }

              path += ` L ${section.endPoint.x} ${section.endPoint.y}`;
              return path;
            }
            return "";
          })
          .attr("fill", "none")
          .attr("stroke", "#999")
          .attr("stroke-width", 1.5)
          .attr("marker-end", "url(#arrowhead)");

        // Define arrow marker for directed edges
        svg
          .append("defs")
          .append("marker")
          .attr("id", "arrowhead")
          .attr("viewBox", "0 -5 10 10")
          .attr("refX", 20)
          .attr("refY", 0)
          .attr("markerWidth", 6)
          .attr("markerHeight", 6)
          .attr("orient", "auto")
          .append("path")
          .attr("d", "M0,-5L10,0L0,5")
          .attr("fill", "#999");

        // Create nodes
        const nodeGroups = g
          .append("g")
          .selectAll("g")
          .data(layoutedGraph.children || [])
          .join("g")
          .attr("class", "graph-node")
          .attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
          .on("click", (event: MouseEvent, d: ElkNode) => {
            if (d.data) {
              setSelectedNode(d.data);
              event.stopPropagation();
            }
          });

        // Add rectangles for nodes
        nodeGroups
          .append("rect")
          .attr("width", (d) => d.width)
          .attr("height", (d) => d.height)
          .attr("rx", 5)
          .attr("ry", 5)
          .attr("fill", (d) => (d.data ? nodeColor(d.data) : "#ccc"))
          .attr("stroke", (d) => (d.data?.multipleComp ? "#e74c3c" : "white"))
          .attr("stroke-width", (d) => (d.data?.multipleComp ? 3 : 1));

        // Add warning icons for multiple components
        nodeGroups
          .filter((d: any) => d.data?.multipleComp)
          .append("text")
          .attr("class", "warning-icon")
          .attr("x", (d) => d.width - 20)
          .attr("y", 15)
          .attr("text-anchor", "middle")
          .text("⚠️");

        // Add labels to nodes
        nodeGroups
          .append("text")
          .attr("class", "node-label")
          .attr("x", (d) => d.width / 2)
          .attr("y", (d) => d.height / 2)
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "middle")
          .attr("fill", "white")
          .text((d) => d.data?.name || "");

        // Clear selection when clicking on the background
        svg.on("click", () => {
          setSelectedNode(null);
        });
      })
      .catch(console.error);
  }, [data]);

  return (
    <div className="graph-view-container">
      <svg ref={svgRef}></svg>

      {selectedNode && (
        <div className="node-details">
          <h3>{selectedNode.name}</h3>
          <p>
            <strong>Type:</strong> {selectedNode.type}
          </p>
          <p>
            <strong>Path:</strong> {selectedNode.path}
          </p>
          {selectedNode.multipleComp && (
            <p className="warning">Multiple components defined in this file!</p>
          )}

          {selectedNode.imports?.length > 0 && (
            <div>
              <p>
                <strong>Imports:</strong>
              </p>
              <ul>
                {selectedNode.imports.map((imp, index) => (
                  <li key={index}>{imp}</li>
                ))}
              </ul>
            </div>
          )}

          {selectedNode.importedBy?.length > 0 && (
            <div>
              <p>
                <strong>Imported By:</strong>
              </p>
              <ul>
                {selectedNode.importedBy.map((imp, index) => (
                  <li key={index}>{imp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
