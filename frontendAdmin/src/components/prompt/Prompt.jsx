"use client";


import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, ShieldAlert, Users } from "lucide-react";
import PromptSettings from "./PromptSettings";

export default function Component() {
  return (
    <div className="ml-12 mb-8 flex justify-center p-4">
      <Tabs defaultValue="public" className="w-[600px] lg:w-[800px] xl:w-[1200px]">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="public" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Public
          </TabsTrigger>
          <TabsTrigger value="educator" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Educator
          </TabsTrigger>
          <TabsTrigger value="admin" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Admin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PromptSettings promptId="Public" /> {/* Use the component */}
        </TabsContent>

        <TabsContent value="educator">
          <PromptSettings promptId="Educator" /> {/* Use the component */}
        </TabsContent>

        <TabsContent value="admin">
          <PromptSettings promptId="Admin" /> {/* Use the component */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
