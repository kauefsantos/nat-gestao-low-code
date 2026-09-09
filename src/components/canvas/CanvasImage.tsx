import { useRef, useEffect, useCallback } from "react";
import { Image as KonvaImage, Transformer } from "react-konva";
import useImage from "@/hooks/use-konva-image";

interface BoardItem {
  id: string;
  image_url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
}

interface Props {
  item: BoardItem;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<BoardItem>) => void;
  onContextMenu?: (e: any) => void;
}

export function CanvasImage({ item, isSelected, onSelect, onUpdate, onContextMenu }: Props) {
  const imageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [image] = useImage(item.image_url || "", "anonymous");

  useEffect(() => {
    if (isSelected && trRef.current && imageRef.current) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = useCallback(
    (e: any) => {
      onUpdate({
        x: e.target.x(),
        y: e.target.y(),
      });
    },
    [onUpdate]
  );

  const handleTransformEnd = useCallback(() => {
    const node = imageRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth = Math.max(20, node.width() * scaleX);
    const newHeight = Math.max(20, node.height() * scaleY);

    // Apply final size directly to the node so it doesn't flash
    // back to old props while the DB update is in flight
    node.scaleX(1);
    node.scaleY(1);
    node.width(newWidth);
    node.height(newHeight);

    onUpdate({
      x: node.x(),
      y: node.y(),
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    });
  }, [onUpdate]);

  if (!image) return null;

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onContextMenu={onContextMenu}
        cornerRadius={12}
        shadowColor="rgba(0,0,0,0.12)"
        shadowBlur={isSelected ? 16 : 8}
        shadowOffsetY={isSelected ? 4 : 2}
        shadowOpacity={1}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) {
              return oldBox;
            }
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
