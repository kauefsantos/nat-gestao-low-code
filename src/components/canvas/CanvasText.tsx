import { useRef, useEffect, useCallback, useState } from "react";
import { Text as KonvaText, Transformer } from "react-konva";

interface BoardItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  metadata: any;
}

interface Props {
  item: BoardItem;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<BoardItem>) => void;
  onContextMenu?: (e: any) => void;
  stageRef: React.RefObject<any>;
  stageScale: number;
  stagePos: { x: number; y: number };
}

const DEFAULT_FONT_SIZE = 18;

export function CanvasText({ item, isSelected, onSelect, onUpdate, onContextMenu, stageRef, stageScale, stagePos }: Props) {
  const textRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [textColor, setTextColor] = useState("#000000");
  const [isEditing, setIsEditing] = useState(false);

  const fontSize = item.metadata?.fontSize ?? DEFAULT_FONT_SIZE;

  // Theme-aware text color
  useEffect(() => {
    const update = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTextColor(isDark ? "#ffffff" : "#000000");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isSelected && trRef.current && textRef.current && !isEditing) {
      trRef.current.nodes([textRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isEditing]);

  const handleDragEnd = useCallback(
    (e: any) => {
      onUpdate({ x: e.target.x(), y: e.target.y() });
    },
    [onUpdate]
  );

  const handleTransformEnd = useCallback(() => {
    const node = textRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const avgScale = (scaleX + scaleY) / 2;

    const currentFontSize = item.metadata?.fontSize ?? DEFAULT_FONT_SIZE;
    const newFontSize = Math.max(8, Math.round(currentFontSize * avgScale));
    const newWidth = Math.max(20, node.width() * scaleX);

    // Reset scale so Konva doesn't double-apply it
    node.scaleX(1);
    node.scaleY(1);
    node.width(newWidth);

    onUpdate({
      x: node.x(),
      y: node.y(),
      width: newWidth,
      rotation: node.rotation(),
      metadata: { ...item.metadata, text: item.metadata?.text || "Text", fontSize: newFontSize },
    });
  }, [onUpdate, item.metadata]);

  const handleDblClick = useCallback(() => {
    setIsEditing(true);
    const node = textRef.current;
    const stage = stageRef.current;
    if (!node || !stage) return;

    node.hide();
    if (trRef.current) trRef.current.hide();
    node.getLayer()?.batchDraw();

    const container = stage.container().getBoundingClientRect();
    const aPos = node.getAbsolutePosition();
    const absScale = node.getAbsoluteScale();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    textarea.value = item.metadata?.text || "Text";
    textarea.style.position = "fixed";
    textarea.style.top = `${container.top + aPos.y}px`;
    textarea.style.left = `${container.left + aPos.x}px`;
    textarea.style.width = `${node.width() * absScale.x}px`;
    textarea.style.minHeight = `${node.height() * absScale.y}px`;
    textarea.style.fontSize = `${fontSize * absScale.x}px`;
    textarea.style.fontFamily = '"Inter", ui-sans-serif, system-ui, sans-serif';
    textarea.style.fontWeight = "700";
    textarea.style.border = "2px solid oklch(0.55 0.22 264)";
    textarea.style.borderRadius = "4px";
    textarea.style.padding = "4px";
    textarea.style.margin = "0";
    textarea.style.overflow = "hidden";
    textarea.style.background = "transparent";
    textarea.style.color = textColor;
    textarea.style.outline = "none";
    textarea.style.resize = "none";
    textarea.style.lineHeight = "1.4";
    textarea.style.zIndex = "10000";
    textarea.style.transformOrigin = "left top";
    textarea.style.transform = `rotate(${node.rotation()}deg)`;

    textarea.focus();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const newText = textarea.value;
      if (textarea.parentNode) document.body.removeChild(textarea);
      node.show();
      if (trRef.current) trRef.current.show();
      node.getLayer()?.batchDraw();
      setIsEditing(false);
      onUpdate({ metadata: { ...item.metadata, text: newText, fontSize } });
    };

    textarea.addEventListener("blur", finish);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") textarea.blur();
    });
  }, [item.metadata, fontSize, stageRef, textColor, onUpdate]);

  const text = item.metadata?.text || "Text";

  return (
    <>
      <KonvaText
        ref={textRef}
        text={text}
        x={item.x}
        y={item.y}
        width={item.width}
        rotation={item.rotation}
        fontSize={fontSize}
        fontFamily='"Inter", ui-sans-serif, system-ui, sans-serif'
        fontStyle="bold"
        fill={textColor}
        lineHeight={1.4}
        draggable
        perfectDrawEnabled={false}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
        onContextMenu={onContextMenu}
      />
      {isSelected && !isEditing && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) return oldBox;
            return newBox;
          }}
          borderStroke="oklch(0.55 0.22 264)"
          borderStrokeWidth={1.5}
          anchorStroke="oklch(0.55 0.22 264)"
          anchorFill="#fff"
          anchorSize={8}
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}
