import { useMemo, useState, useEffect } from "react";
import { Circle, Group } from "react-konva";

interface Props {
  stagePos: { x: number; y: number };
  stageScale: number;
  stageSize: { width: number; height: number };
}

export function DotGrid({ stagePos, stageScale, stageSize }: Props) {
  const [dotColor, setDotColor] = useState("#c0c0c8");

  useEffect(() => {
    const update = () => {
      const style = getComputedStyle(document.documentElement);
      const raw = style.getPropertyValue("--canvas-dot").trim();
      if (raw) setDotColor(raw);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const dots = useMemo(() => {
    const spacing = 32;
    const result: { x: number; y: number }[] = [];

    // Calculate visible area in canvas coordinates
    const startX = Math.floor(-stagePos.x / stageScale / spacing) * spacing - spacing;
    const startY = Math.floor(-stagePos.y / stageScale / spacing) * spacing - spacing;
    const endX = startX + (stageSize.width / stageScale) + spacing * 2;
    const endY = startY + (stageSize.height / stageScale) + spacing * 2;

    for (let x = startX; x < endX; x += spacing) {
      for (let y = startY; y < endY; y += spacing) {
        result.push({ x, y });
      }
    }

    return result;
  }, [stagePos.x, stagePos.y, stageScale, stageSize.width, stageSize.height]);

  return (
    <Group name="dot-grid">
      {dots.map((dot, i) => (
        <Circle
          key={i}
          x={dot.x}
          y={dot.y}
          radius={1}
          fill={dotColor}
          listening={false}
        />
      ))}
    </Group>
  );
}
