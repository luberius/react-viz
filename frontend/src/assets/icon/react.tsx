import { IconProps } from "@/types/icon";

const ReactIcon = ({ width, height, color }: IconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-11.5 -10.23174 23 20.46348"
      width={width || 16}
      height={height || 16}
    >
      <title>React Logo</title>
      <circle cx="0" cy="0" r="2.05" fill={color || "#000"} />
      <g stroke={color || "#000"} stroke-width="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
};

export default ReactIcon;
