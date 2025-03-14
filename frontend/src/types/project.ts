// Type definitions for React Project Visualizer

/**
 * Represents a component node in the React project
 */
export interface ComponentNode {
  id: string;
  name: string;
  path: string;
  type: "component" | "state" | "util" | "root" | "directory";
  multipleComp: boolean;
  imports: string[];
  importedBy: string[];
  children?: ComponentNode[];
}

/**
 * Project statistics
 */
export interface ProjectStats {
  totalComponents: number;
  multiCompFiles: number;
  componentFiles: number;
  stateFiles: number;
  utilFiles: number;
}

/**
 * Represents the entire React project structure
 */
export interface Project {
  root: ComponentNode;
  nodesMap: Record<string, ComponentNode>;
  files: string[];
  stats: ProjectStats;
}

/**
 * Props for TreeView component
 */
export interface TreeViewProps {
  data: Project;
}

/**
 * Props for GraphView component
 */
export interface GraphViewProps {
  data: Project;
}

/**
 * Props for ProjectStats component
 */
export interface ProjectStatsProps {
  stats: ProjectStats;
  projectName: string;
}

/**
 * D3 Node data with position
 */
export interface D3Node extends ComponentNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

/**
 * D3 Link data
 */
export interface D3Link {
  source: string | D3Node;
  target: string | D3Node;
}
