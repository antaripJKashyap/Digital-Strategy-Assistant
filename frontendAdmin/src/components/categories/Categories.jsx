"use client";

import { useEffect, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAuthSession } from "aws-amplify/auth";
import SortableRow from "./SortableRow";
import Loading from "../Loading/loading";

const Categories = ({
  setSelectedPage,
  setNextCategoryNumber,
  setSelectedCategory,
}) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const session = await fetchAuthSession();
        var token = session.tokens.idToken;
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/categories`,
          {
            method: "GET",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          console.log("categories", data);
          setCategories(data);
          setNextCategoryNumber(data.length + 1);
        } else {
          console.error("Failed to fetch categories:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [setNextCategoryNumber]);

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
        );
        const newIndex = items.findIndex(
          (item) => item.category_number === over.id
        );

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="mx-16 w-9/12 max-w-6xl space-y-6 overflow-hidden">
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
                      setSelectedCategory={setSelectedCategory}
                      setSelectedPage={setSelectedPage}
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
