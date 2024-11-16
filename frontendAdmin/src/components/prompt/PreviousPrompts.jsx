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
export default function PreviousPrompts({ previousPrompts }) {
  const [currentPage, setCurrentPage] = useState(0);
  return (
    <div className="w-full sm:max-w-xl md:max-w-full mx-auto px-4 py-1">
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
              {[...Array(previousPrompts.length)].map((_, index) => (
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
                setCurrentPage(
                  Math.min(previousPrompts.length - 1, currentPage + 1)
                )
              }
              disabled={currentPage === previousPrompts.length - 1}
            >
              NEXT
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>

          {/* Prompt Content */}
          <div className="text-center">
            <p className="text-gray-700 mb-1 text-xs sm:text-sm">
              {previousPrompts[currentPage].prompt}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">
              {previousPrompts[currentPage].time_created}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end py-1 sm:py-2"></CardFooter>
      </Card>
    </div>
  );
}
