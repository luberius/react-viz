import ReactIcon from "@/assets/icon/react";
import ReduxIcon from "@/assets/icon/redux";
import { ProjectStatsProps } from "../types/project";
import "./ProjectStats.css";

export const ProjectStats: React.FC<ProjectStatsProps> = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="project-stats">
      <div className="stats-container">
        <div className="stat-value">
          <ReactIcon />
          {stats.componentFiles}
        </div>
        <div className="stat-value">
          <ReduxIcon />
          {stats.stateFiles}
        </div>
        <div className="stat-value">{stats.utilFiles}</div>
        <div className="stat-value">{stats.multiCompFiles}</div>
      </div>

      <div className="legend">
        <div className="legend-item">
          <span className="legend-color component"></span>
          <span>Component</span>
        </div>
        <div className="legend-item">
          <span className="legend-color state"></span>
          <span>State</span>
        </div>
        <div className="legend-item">
          <span className="legend-color util"></span>
          <span>Utility</span>
        </div>
        <div className="legend-item">
          <span className="legend-warning">⚠️</span>
          <span>Multiple Components</span>
        </div>
      </div>
    </div>
  );
};
