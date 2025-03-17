import React, { useEffect, useRef, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import * as d3 from "d3";
import { GraphViewProps, D3Node } from "../types/project";
import "./GraphView.css";
import { useSnapshot } from "valtio";
import { globalStore } from "@/stores/global";

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

  const snap = useSnapshot(globalStore);

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

    // Create a container group for all elements
    const g = svg.append("g");

    // Initialize zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    // Apply zoom to the SVG
    svg.call(zoom);

    // Set initial zoom position
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 6, height / 6).scale(0.8),
    );

    // Get nodes from data
    let nodes: D3Node[] = Object.values(data.nodesMap);
    let elkNodes: ElkNode[] = [];
    let elkEdges: ElkEdge[] = [];

    // Filter nodes and edges based on selectedFile
    if (snap.selectedFile) {
      const selectedFileNode = data.nodesMap[snap.selectedFile];

      if (selectedFileNode) {
        // Create a set to track all relevant nodes
        const relevantNodeIds = new Set<string>();
        relevantNodeIds.add(selectedFileNode.id);

        // Add imported nodes
        if (selectedFileNode.imports) {
          selectedFileNode.imports.forEach((importPath) => {
            if (data.nodesMap[importPath]) {
              relevantNodeIds.add(importPath);
            }
          });
        }

        // Add nodes that import the selected file
        if (selectedFileNode.importedBy) {
          selectedFileNode.importedBy.forEach((importerPath) => {
            if (data.nodesMap[importerPath]) {
              relevantNodeIds.add(importerPath);
            }
          });
        }

        // Filter nodes to only include relevant ones
        nodes = nodes.filter((node) => relevantNodeIds.has(node.id));

        // Create ELK nodes
        elkNodes = nodes.map((node) => ({
          id: node.id,
          width: 120,
          height: 50,
          data: node,
        }));

        // Create ELK edges for the filtered set
        nodes.forEach((node) => {
          // Only add edges between nodes in our filtered set
          node.imports?.forEach((importPath, index) => {
            if (relevantNodeIds.has(importPath)) {
              elkEdges.push({
                id: `${node.id}_to_${importPath}_${index}`,
                sources: [node.id],
                targets: [importPath],
              });
            }
          });
        });
      }
    } else {
      // If no file is selected, show all nodes
      elkNodes = nodes.map((node) => ({
        id: node.id,
        width: 120,
        height: 50,
        data: node,
      }));

      // Create edges for all nodes
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
    }

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
        // Auto-center the view based on the graph size
        // Calculate the bounding box of the graph
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        (layoutedGraph.children || []).forEach((node) => {
          const x = node.x || 0;
          const y = node.y || 0;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + (node.width || 0));
          maxY = Math.max(maxY, y + (node.height || 0));
        });

        // Only adjust view if we have nodes
        if (layoutedGraph.children && layoutedGraph.children.length > 0) {
          // Compute graph center and dimensions
          const graphWidth = maxX - minX;
          const graphHeight = maxY - minY;
          const graphCenterX = minX + graphWidth / 2;
          const graphCenterY = minY + graphHeight / 2;

          // Compute appropriate scale
          const scale = Math.min(
            0.8, // Maximum scale
            0.9 * Math.min(width / graphWidth, height / graphHeight),
          );

          // Apply transform with a slight delay to ensure smooth transition
          setTimeout(() => {
            svg
              .transition()
              .duration(750)
              .call(
                zoom.transform,
                d3.zoomIdentity
                  .translate(
                    width / 2 - graphCenterX * scale,
                    height / 2 - graphCenterY * scale,
                  )
                  .scale(scale),
              );
          }, 100);
        }

        // Define node color based on type
        const nodeColor = (d: D3Node) => {
          // Highlight the selected file
          if (d.id === snap.selectedFile) {
            return "#e74c3c"; // Highlight color for selected file
          }

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

        // Define arrow markers for directed edges
        const defs = svg.append("defs");

        // Regular arrow
        defs
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

        // Highlighted arrow for selected file
        defs
          .append("marker")
          .attr("id", "selectedArrowhead")
          .attr("viewBox", "0 -5 10 10")
          .attr("refX", 20)
          .attr("refY", 0)
          .attr("markerWidth", 6)
          .attr("markerHeight", 6)
          .attr("orient", "auto")
          .append("path")
          .attr("d", "M0,-5L10,0L0,5")
          .attr("fill", "#e74c3c");

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
          .attr("stroke", (edge) => {
            // Highlight edges connected to selected file
            const isFromSelected = edge.sources.includes(snap.selectedFile);
            const isToSelected = edge.targets.includes(snap.selectedFile);
            return isFromSelected || isToSelected ? "#e74c3c" : "#999";
          })
          .attr("stroke-width", (edge) => {
            // Make edges connected to selected file thicker
            const isFromSelected = edge.sources.includes(snap.selectedFile);
            const isToSelected = edge.targets.includes(snap.selectedFile);
            return isFromSelected || isToSelected ? 2.5 : 1.5;
          })
          .attr("marker-end", (edge) => {
            const isFromSelected = edge.sources.includes(snap.selectedFile);
            const isToSelected = edge.targets.includes(snap.selectedFile);
            return isFromSelected || isToSelected
              ? "url(#selectedArrowhead)"
              : "url(#arrowhead)";
          });

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
          .attr("stroke", (d) => {
            if (d.data?.id === snap.selectedFile) {
              return "#fff"; // White border for selected file
            }
            return d.data?.multipleComp ? "#e74c3c" : "white";
          })
          .attr("stroke-width", (d) => {
            if (d.data?.id === snap.selectedFile) {
              return 3; // Thicker border for selected file
            }
            return d.data?.multipleComp ? 3 : 1;
          });

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
  }, [data, snap.selectedFile]);

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
