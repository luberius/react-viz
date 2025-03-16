import { useState } from "react";
import { ScanProject, SelectDirectory } from "@wailsjs/go/main/App";
import { ReactFlowProvider } from "@xyflow/react";
import { Project } from "./types/project";
import { TreeView } from "./components/TreeView";
import { GraphView } from "./components/GraphView";
import { ProjectStats } from "./components/ProjectStats";
import "./App.css";

const App = () => {
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"tree" | "graph">("tree");
  const [projectPath, setProjectPath] = useState<string>("");

  const handleSelectDirectory = async (): Promise<void> => {
    try {
      const selectedDir = await SelectDirectory();
      if (selectedDir) {
        setProjectPath(selectedDir);
        handleScanProject(selectedDir);
      }
    } catch (err) {
      setError(
        `Failed to select directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleScanProject = async (dir: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const jsonData = await ScanProject(dir);
      const data = JSON.parse(jsonData) as Project;
      setProjectData(data);
    } catch (err) {
      setError(
        `Failed to scan project: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = (): void => {
    if (projectPath) {
      handleScanProject(projectPath);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>React Project Visualizer</h1>
        <div className="header-controls">
          <button onClick={handleSelectDirectory}>
            {projectPath ? "Change Project" : "Select Project"}
          </button>
          {projectPath && <button onClick={handleRefresh}>Refresh</button>}
        </div>
      </header>

      <main className="app-content">
        {loading && (
          <div className="loading-indicator">
            <p>Scanning project...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !projectData && (
          <div className="empty-state">
            <p>
              Select a React project directory to visualize its component
              structure.
            </p>
          </div>
        )}

        {!loading && !error && projectData && (
          <div className="project-view">
            <div className="visualization">
              <TreeView data={projectData} />
              <ReactFlowProvider>
                <GraphView data={projectData} />
              </ReactFlowProvider>
            </div>
            <div className="stats">
              <ProjectStats
                stats={projectData.stats}
                projectName={projectData.root.name}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
