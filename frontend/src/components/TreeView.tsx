import { globalStore } from "@/stores/global";
import React, { useState, useEffect } from "react";
import { TreeViewProps, D3Node } from "../types/project";
import "./TreeView.css";

type TreeNode = {
  id: string;
  name: string;
  type: string;
  multipleComp?: boolean;
  imports: string[];
  importedBy: string[];
  path: string;
  children: TreeNode[];
};

export const TreeView: React.FC<TreeViewProps> = ({ data }) => {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
    {},
  );
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Build the tree when data changes
  useEffect(() => {
    if (!data || !data.nodesMap) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const tree = buildTree();
      setTreeData(tree);
      // Auto-expand root node
      setExpandedNodes({ root: true });
      setIsLoading(false);
    } catch (error) {
      console.error("Error building tree:", error);
      setIsLoading(false);
    }
  }, [data]);

  // Function to build the tree structure
  const buildTree = () => {
    const nodes = Object.values(data.nodesMap);

    // Group nodes by directory path
    const directoryMap = new Map<string, TreeNode>();

    // Create a root node
    const rootNode: TreeNode = {
      id: "root",
      name: "Project Root",
      type: "folder",
      imports: [],
      importedBy: [],
      path: "/",
      children: [],
    };

    directoryMap.set("/", rootNode);

    // Process all nodes
    nodes.forEach((node: D3Node) => {
      const pathParts = node.path.split("/");
      const fileName = pathParts.pop() || "";

      // Build the directory path incrementally
      let currentPath = "";
      let parentPath = "/";

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!part) continue; // Skip empty parts

        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!directoryMap.has(currentPath)) {
          const dirNode: TreeNode = {
            id: currentPath,
            name: part,
            type: "folder",
            imports: [],
            importedBy: [],
            path: currentPath,
            children: [],
          };

          directoryMap.set(currentPath, dirNode);

          // Add to parent directory
          const parentDir = directoryMap.get(prevPath || "/");
          if (parentDir) {
            parentDir.children.push(dirNode);
          }
        }

        parentPath = currentPath;
      }

      // Create file node
      const fileNode: TreeNode = {
        id: node.id,
        name: fileName,
        type: node.type,
        multipleComp: node.multipleComp,
        imports: node.imports,
        importedBy: node.importedBy,
        path: node.path,
        children: [],
      };

      // Add file to its parent directory
      const parentDir = directoryMap.get(parentPath);
      if (parentDir) {
        parentDir.children.push(fileNode);
      }
    });

    // Sort children alphabetically, with folders first
    directoryMap.forEach((dir) => {
      dir.children.sort((a, b) => {
        // Folders first
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;

        // Alphabetical by name
        return a.name.localeCompare(b.name);
      });
    });

    return [rootNode];
  };

  const toggleNode = (nodeId: string): void => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Calculate importance score
  const calculateImportanceScore = (node: TreeNode): number => {
    if (node.type === "folder") return 0;

    let score = 0;
    // Base centrality
    score += (node.imports.length + node.importedBy.length) / 2;
    // Impact factor (being imported by others is more important)
    score += node.importedBy.length * 1.5;
    // Risk factor for multiple components
    if (node.multipleComp) {
      score += 5;
    }
    return Math.round(score);
  };

  const handleClickNode = (hasChildren: boolean, node: TreeNode) => {
    if (node.id === "root") {
      globalStore.selectedFile = "";
      return;
    }

    if (hasChildren) toggleNode(node.id);

    if (!hasChildren && node.type !== "folder") {
      globalStore.selectedFile = node.id;
    }
  };

  // Recursive rendering of tree nodes
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes[node.id] || false;

    let nodeClassName =
      node.type === "folder"
        ? "tree-node node-type-folder"
        : `tree-node node-type-${node.type}`;

    if (node.multipleComp) {
      nodeClassName += " multiple-components";
    }

    // Add indicators for import/imported-by counts for files
    const importCount = node.imports.length;
    const importedByCount = node.importedBy.length;

    // Calculate importance score for files
    const importanceScore =
      node.type !== "folder" ? calculateImportanceScore(node) : 0;

    return (
      <div key={node.id} className={nodeClassName}>
        <div
          className={`node-content ${importanceScore > 10 ? "high-importance" : ""}`}
          onClick={() => handleClickNode(hasChildren, node)}
        >
          {hasChildren && node.type === "folder" && !isExpanded && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z"></path>
            </svg>
          )}
          {hasChildren && node.type === "folder" && isExpanded && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64ZM93.34,64,123.2,86.4A8,8,0,0,0,128,88h72v16H69.77a16,16,0,0,0-15.18,10.94L40,158.7V64Zm112,136H43.1l26.67-80H232Z"></path>
            </svg>
          )}
          {node.type === "component" && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#4a90e2"
              viewBox="0 0 256 256"
            >
              <path d="M147.81,196.31a20.82,20.82,0,0,1-9.19,15.23C133.43,215,127,216,121.13,216a60.63,60.63,0,0,1-15.19-2,8,8,0,0,1,4.31-15.41c4.38,1.21,15,2.71,19.55-.35.88-.6,1.83-1.52,2.14-3.93.34-2.67-.72-4.1-12.78-7.59-9.35-2.7-25-7.23-23-23.11a20.58,20.58,0,0,1,9-14.95c11.85-8,30.72-3.31,32.84-2.76a8,8,0,0,1-4.07,15.48c-4.49-1.17-15.23-2.56-19.83.56a4.54,4.54,0,0,0-2,3.67c-.12.9-.14,1.08,1.11,1.9,2.31,1.49,6.45,2.68,10.45,3.84C133.49,174.17,150,179,147.81,196.31ZM72,144a8,8,0,0,0-8,8v38a10,10,0,0,1-20,0,8,8,0,0,0-16,0,26,26,0,0,0,52,0V152A8,8,0,0,0,72,144Zm140.65,1.49a8,8,0,0,0-11.16,1.86L188,166.24l-13.49-18.89a8,8,0,0,0-13,9.3L178.17,180l-16.68,23.35a8,8,0,0,0,13,9.3L188,193.76l13.49,18.89a8,8,0,0,0,13-9.3L197.83,180l16.68-23.35A8,8,0,0,0,212.65,145.49ZM216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88Zm-27.31-8L160,51.31V80Z"></path>
            </svg>
          )}
          {node.type === "state" && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#e67e22"
              viewBox="0 0 256 256"
            >
              <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40v72a8,8,0,0,0,16,0V40h88V88a8,8,0,0,0,8,8h48V216H176a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160Zm-12.19,145a20.82,20.82,0,0,1-9.19,15.23C133.43,215,127,216,121.13,216a61.34,61.34,0,0,1-15.19-2,8,8,0,0,1,4.31-15.41c4.38,1.2,15,2.7,19.55-.36.88-.59,1.83-1.52,2.14-3.93.34-2.67-.71-4.1-12.78-7.59-9.35-2.7-25-7.23-23-23.11a20.56,20.56,0,0,1,9-14.95c11.84-8,30.71-3.31,32.83-2.76a8,8,0,0,1-4.07,15.48c-4.49-1.17-15.23-2.56-19.83.56a4.54,4.54,0,0,0-2,3.67c-.12.9-.14,1.09,1.11,1.9,2.31,1.49,6.45,2.68,10.45,3.84C133.49,174.17,150.05,179,147.81,196.31ZM80,152v38a26,26,0,0,1-52,0,8,8,0,0,1,16,0,10,10,0,0,0,20,0V152a8,8,0,0,1,16,0Z"></path>
            </svg>
          )}
          {node.type === "util" && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#2ecc71"
              viewBox="0 0 256 256"
            >
              <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40v72a8,8,0,0,0,16,0V40h88V88a8,8,0,0,0,8,8h48V216H176a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160Zm-12.19,145a20.82,20.82,0,0,1-9.19,15.23C133.43,215,127,216,121.13,216a61.34,61.34,0,0,1-15.19-2,8,8,0,0,1,4.31-15.41c4.38,1.2,15,2.7,19.55-.36.88-.59,1.83-1.52,2.14-3.93.34-2.67-.71-4.1-12.78-7.59-9.35-2.7-25-7.23-23-23.11a20.56,20.56,0,0,1,9-14.95c11.84-8,30.71-3.31,32.83-2.76a8,8,0,0,1-4.07,15.48c-4.49-1.17-15.23-2.56-19.83.56a4.54,4.54,0,0,0-2,3.67c-.12.9-.14,1.09,1.11,1.9,2.31,1.49,6.45,2.68,10.45,3.84C133.49,174.17,150.05,179,147.81,196.31ZM80,152v38a26,26,0,0,1-52,0,8,8,0,0,1,16,0,10,10,0,0,0,20,0V152a8,8,0,0,1,16,0Z"></path>
            </svg>
          )}
          <span className="node-name">{node.name}</span>

          {node.type !== "folder" && (
            <>
              {node.multipleComp && (
                <span
                  className="warning-icon"
                  title="Multiple components detected in this file"
                >
                  ⚠️
                </span>
              )}

              {importCount > 0 && (
                <span
                  className="count-badge imports-badge"
                  title={`Imports: ${importCount}`}
                >
                  {importCount}
                </span>
              )}

              {importedByCount > 0 && (
                <span
                  className="count-badge imported-by-badge"
                  title={`Imported by: ${importedByCount}`}
                >
                  {importedByCount}
                </span>
              )}

              {importanceScore > 10 && (
                <span
                  className="importance-badge"
                  title={`Importance Score: ${importanceScore}`}
                >
                  !
                </span>
              )}
            </>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children.map((childNode) =>
              renderTreeNode(childNode, depth + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tree-view-container">
      {isLoading ? (
        <div className="loading-message">Building tree structure...</div>
      ) : treeData.length > 0 ? (
        <div className="tree-content">
          {treeData.map((rootNode) => renderTreeNode(rootNode))}
        </div>
      ) : (
        <div className="empty-message">No files found.</div>
      )}
    </div>
  );
};
