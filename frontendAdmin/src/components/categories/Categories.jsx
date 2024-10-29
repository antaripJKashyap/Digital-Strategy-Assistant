"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, GripVertical, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SortableRow = ({ category }) => {
  const { attributes, listeners, transform, transition, setNodeRef } =
    useSortable({ id: category.category_number }); // Change here

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

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
          <span>{category.name}</span>
        </div>
      </TableCell>
      <TableCell className="">
        <Button className="py-4 bg-adminMain hover:bg-[#000060] text-white font-semibold">
          MANAGE
        </Button>
      </TableCell>
    </TableRow>
  );
};

const Categories = ({ setSelectedPage }) => {
  const [categories, setCategories] = useState([
    { category_number: "1", name: "Policies and Processes" },
    { category_number: "2", name: "System Collaboration" },
    { category_number: "3", name: "Enhancing Digital Equity" },
    { category_number: "4", name: "Risk Management" },
    { category_number: "5", name: "Customer Support" },
    { category_number: "6", name: "Product Development" },
    { category_number: "7", name: "Sales Strategy" },
    { category_number: "8", name: "Marketing Initiatives" },
    { category_number: "9", name: "Financial Planning" },
    { category_number: "10", name: "Quality Assurance" },
    { category_number: "11", name: "Human Resources" },
    { category_number: "12", name: "Training and Development" },
    { category_number: "13", name: "Project Management" },
    { category_number: "14", name: "Legal Compliance" },
    { category_number: "15", name: "Data Analysis" },
    { category_number: "16", name: "Supply Chain Management" },
    { category_number: "17", name: "Information Technology" },
    { category_number: "18", name: "Corporate Strategy" },
    { category_number: "19", name: "Public Relations" },
    { category_number: "20", name: "Innovation and R&D" },
    { category_number: "21", name: "Vendor Management" },
    { category_number: "22", name: "Sustainability Initiatives" },
    { category_number: "23", name: "Performance Metrics" },
    { category_number: "24", name: "Crisis Management" },
    { category_number: "25", name: "Employee Engagement" },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setCategories((items) => {
        const oldIndex = items.findIndex(
          (item) => item.category_number === active.id
        ); // Updated to use category_number
        const newIndex = items.findIndex(
          (item) => item.category_number === over.id
        ); // Updated to use category_number

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div className="ml-16  mr-32 w-full max-w-8xl space-y-6 overflow-hidden">
      {" "}
      {/* Change here */}
      <div className="mt-8 rounded-md border">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Move</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={categories.map((category) => category.category_number)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map((category) => (
                    <SortableRow
                      key={category.category_number}
                      category={category}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </div>
        </DndContext>
      </div>
      <div className="flex flex-row justify-between">
        <Button
          onClick={() => setSelectedPage("category_creation")}
          className="bg-adminMain hover:bg-[#000060] text-white font-semibold py-4"
        >
          Create New Category
        </Button>
        <Button className="bg-adminMain hover:bg-[#000060] text-white font-semibold py-4">
          Save Order
        </Button>
      </div>
    </div>
  );
};

export default Categories;
