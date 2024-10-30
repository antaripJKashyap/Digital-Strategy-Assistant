"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, ShieldAlert, Users } from "lucide-react";
import PreviousPrompts from "./PreviousPrompts";

export default function Component() {
  return (
    <div className="ml-12 mb-8 flex justify-center p-4">
      <Tabs defaultValue="public" className="w-[1000px]">
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
          <Card>
            <CardHeader>
              <CardTitle>Public Prompt Settings</CardTitle>
              <CardDescription>
                Warning: modifying the prompt in the text area below can
                significantly impact the quality and accuracy of the responses.{" "}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your Prompt</Label>
                <textarea
                  id="name"
                  placeholder="Type your text here..."
                  className="min-h-64 w-full resize-none overflow-hidden border p-2 rounded"
                />
              </div>
            </CardContent>
            <CardFooter>
              <div className="flex flex-col">
                <PreviousPrompts />
                <Button>Save</Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="educator">
          <Card>
            <CardHeader>
              <CardTitle>Educator Prompt Settings</CardTitle>
              <CardDescription>
                Warning: modifying the prompt in the text area below can
                significantly impact the quality and accuracy of the responses.{" "}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Area</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="math">Mathematics</SelectItem>
                    <SelectItem value="science">Science</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="history">History</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">Grade Level</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elementary">Elementary</SelectItem>
                    <SelectItem value="middle">Middle School</SelectItem>
                    <SelectItem value="high">High School</SelectItem>
                    <SelectItem value="college">College</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="certification">Certification Number</Label>
                <Input
                  id="certification"
                  placeholder="Enter your certification number"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Update Profile</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="admin">
          <Card>
            <CardHeader>
              <CardTitle>Admin Prompt Settings</CardTitle>
              <CardDescription>
                Warning: modifying the prompt in the text area below can
                significantly impact the quality and accuracy of the responses.{" "}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="permissions">User Management</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select permission level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View Only</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="full">Full Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="system">System Settings</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select system module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="backup">Backup</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logs">Access Logs</Label>
                <Input id="logs" placeholder="Search logs..." />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">Export Logs</Button>
              <Button>Apply Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
