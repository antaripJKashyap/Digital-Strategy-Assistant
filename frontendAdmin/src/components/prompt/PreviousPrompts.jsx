"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

// Sample prompts data
const prompts = [
  {
    id: 1,
    text: "Engage with the student by asking questions and conversing with them to identify any gaps in their understanding of the topic. If you identify gaps, address these gaps by providing explanations, answering the student's questions, and referring to the relevant context to help the student gain a comprehensive understanding of the topic. Only respond with java code",
    timestamp: "10/8/2024, 12:15:34 PM",
  },
  // Add more prompts as needed
];

export default function PreviousPrompts() {
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = 15; // Total number of pages

  return (
    <div className="w-full max-w-[80%] sm:max-w-xl mx-auto px-4 py-1">
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-base sm:text-md font-semibold text-center">
            Previous Prompts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 py-1 sm:py-2">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-2 flex-wrap sm:flex-nowrap gap-1">
            <Button
              variant="ghost"
              className="text-gray-500 hover:text-gray-700 w-full sm:w-auto text-sm"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-3 w-3 mr-1" />
              BACK
            </Button>
            <div className="flex items-center gap-1 justify-center sm:justify-start w-full sm:w-auto">
              {[...Array(totalPages)].map((_, index) => (
                <button
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    index === currentPage
                      ? "bg-customSecondary"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                  onClick={() => setCurrentPage(index)}
                  aria-label={`Go to page ${index + 1}`}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              className="text-primary hover:text-primary/90 w-full sm:w-auto text-sm"
              onClick={() =>
                setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
              }
              disabled={currentPage === totalPages - 1}
            >
              NEXT
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>

          {/* Prompt Content */}
          <div className="text-center">
            <p className="text-gray-700 mb-1 text-xs sm:text-sm">
              {prompts[0].text}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">
              {prompts[0].timestamp}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end py-1 sm:py-2"></CardFooter>
      </Card>
    </div>
  );
}
