"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TableRow,
  TableCell,
} from "@/components/ui/table";

const SortableRow = ({ category, setSelectedCategory, setSelectedPage }) => {
  const { attributes, listeners, transform, transition, setNodeRef } =
    useSortable({ id: category.category_number });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  const handleManage = async() => {
    setSelectedCategory(category);
    setSelectedPage("edit_category");
  }

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/5">
      <TableCell className="w-[80px]">
        <Button
          variant="ghost"
          size="icon"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing h-8 w-8"
        >
          <GripVertical className="h-4 w-4" />
          <span className="sr-only">Move row</span>
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span>{category.category_name.replace(/\b\w/g, char => char.toUpperCase())}</span>
        </div>
      </TableCell>
      <TableCell>
        <Button onClick={handleManage} className="py-4 bg-adminMain hover:bg-adminHover text-white font-semibold">
          MANAGE
        </Button>
      </TableCell>
    </TableRow>
  );
};

export default SortableRow;
