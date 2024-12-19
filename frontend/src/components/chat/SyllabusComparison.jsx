import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-toastify";

const SyllabusComparisonModal = ({
  isOpen,
  onClose,
  onSubmit,
  textSyllabus,
  setTextSyllabus,
  files,
  setFiles,
  selectedCriteria,
  setSelectedCriteria,
}) => {
  const [activeTab, setActiveTab] = useState("text");
  const [guidelines, setGuidelines] = useState([]);
  const [isLoadingGuidelines, setIsLoadingGuidelines] = useState(false);
  useEffect(() => {
    console.log("guidelines", guidelines);
    console.log("selectedCriteria", selectedCriteria);
  }, [guidelines, selectedCriteria]);
  useEffect(() => {
    const fetchGuidelines = async () => {
      setIsLoadingGuidelines(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/guidelines`
        );
        if (!response.ok) throw new Error("Failed to fetch guidelines");
        const data = await response.json();
        setGuidelines(data.guidelines);
      } catch (error) {
        console.error("Error fetching guidelines:", error);
        toast.error("Failed to fetch guidelines");
      } finally {
        setIsLoadingGuidelines(false);
      }
    };

    if (isOpen) {
      fetchGuidelines();
    }
  }, [isOpen]);

  const handleCriteriaChange = (e) => {
    const criteriaName = e.target.value;
    setSelectedCriteria((prev) =>
      e.target.checked
        ? [...prev, criteriaName]
        : prev.filter((name) => name !== criteriaName)
    );
  };
  useEffect(() => {
    if (activeTab === "text") {
      setFiles([]);
    } else if (activeTab === "files") {
      setTextSyllabus("");
    }
  }, [activeTab, setFiles, setTextSyllabus]);

  const handleFileChange = (event) => {
    const newFiles = Array.from(event.target.files);
    // Check file size
    const oversizedFiles = newFiles.filter(
      (file) => file.size > 25 * 1024 * 1024
    );
    if (oversizedFiles.length > 0) {
      toast.error("Files must be less than 25MB");
      return;
    }
    setFiles(newFiles);
    setActiveTab("files");
  };

  const removeFile = () => {
    setFiles([]);
  };

  const handleSubmit = () => {
    if (!selectedCriteria.length) {
      toast.error("Please select at least one criterion for comparison");
      return;
    }
    // Prevent submission if both text and files are empty
    if (activeTab === "text" && !textSyllabus.trim()) {
      toast.error("Please enter text");
      return;
    }

    if (activeTab === "files" && files.length === 0) {
      toast.error("Please upload at least one file");
      return;
    }

    onClose();

    onSubmit();
  };

  // Truncate filename if it's too long
  const formatFileName = (fileName, maxLength = 30) => {
    if (fileName.length <= maxLength) return fileName;
    const extensionStart = fileName.lastIndexOf(".");
    if (extensionStart === -1) {
      return fileName.substring(0, maxLength) + "...";
    }
    const name = fileName.substring(0, extensionStart);
    const extension = fileName.substring(extensionStart);

    if (name.length > maxLength - 3) {
      return name.substring(0, maxLength - 3) + "..." + extension;
    }

    return name + "..." + extension;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl sm:max-w-2xl">
        {" "}
        {/* Increased width */}
        <DialogHeader>
          <DialogTitle>Compare Materials</DialogTitle>
          <DialogDescription>
            Choose to upload files or paste text of course materials to compare
            with the Digital Strategy Guidelines. Examples of course materials
            include syllabi, course outlines, and policy documents. Files must
            be less than 25MB.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="files">Upload File</TabsTrigger>
            <TabsTrigger value="text">Enter Text</TabsTrigger>
          </TabsList>

          <TabsContent value="text">
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="syllabus-text">Enter Text</Label>
              <textarea
                id="syllabus-text"
                value={textSyllabus}
                onChange={(e) => {
                  setTextSyllabus(e.target.value);
                }}
                className="w-full border p-2 rounded min-h-[150px]"
                placeholder="Paste text here"
              />
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="syllabus-upload">Upload File</Label>
              <Input
                id="syllabus-upload"
                type="file"
                multiple
                onChange={handleFileChange}
                accept=".pdf,.docx,.pptx,.txt,.xlsx,.xps,.mobi,.cbz"
                onClick={(e) => {
                  e.currentTarget.value = null;
                }}
              />
              {files.length > 0 && (
                <div>
                  <p className="mb-2">Selected File:</p>
                  <ul>
                    {files.map((file, index) => (
                      <li
                        key={index}
                        className="flex justify-between items-center mb-1 p-2 bg-gray-100 rounded overflow-hidden"
                      >
                        <span className="truncate max-w-[70%]">
                          {formatFileName(file.name)}
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={removeFile}
                          className="flex-shrink-0 ml-2"
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <div className="mt-4">
          <h3 className="mb-2 font-semibold">
            Select Sub-Criteria for Comparison:
          </h3>
          {isLoadingGuidelines ? (
            <p>Loading criteria...</p>
          ) : guidelines.length > 0 ? (
            <div>
              {guidelines.map((guideline) => (
                <div
                  key={guideline.criteria_name}
                  className="flex items-center space-x-2 mb-2"
                >
                  <input
                    type="checkbox"
                    id={guideline.criteria_name}
                    value={guideline.criteria_name}
                    checked={selectedCriteria.includes(guideline.criteria_name)}
                    onChange={handleCriteriaChange}
                    className="form-checkbox h-4 w-4 text-blue-600"
                  />
                  <label
                    htmlFor={guideline.criteria_name}
                    className="text-sm font-medium leading-none"
                  >
                    {guideline.criteria_name}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p>No criteria available. Please contact the administrator.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button className="bg-customMain" onClick={handleSubmit}>
            Submit {activeTab === "text" ? "Text" : "File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyllabusComparisonModal;
