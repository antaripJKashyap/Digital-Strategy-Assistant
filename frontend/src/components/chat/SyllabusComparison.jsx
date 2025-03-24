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
  const fileInputRef = React.useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const MAX_WORD_COUNT = 2000;
  
  useEffect(() => {
    
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

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const removeFile = (indexToRemove) => {
    setFiles(files.filter((_, index) => index !== indexToRemove));
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    const words = text.trim() === "" ? [] : text.trim().split(/\s+/);
    const count = words.length;
    
    if (count <= MAX_WORD_COUNT) {
      setTextSyllabus(text);
      setWordCount(count);
    } else {
      // Truncate text to max word count
      const truncatedText = words.slice(0, MAX_WORD_COUNT).join(" ");
      setTextSyllabus(truncatedText);
      setWordCount(MAX_WORD_COUNT);
      toast.error(`Text exceeds the ${MAX_WORD_COUNT} word limit. Please shorten your text or upload a file.`);
    }
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
        <DialogHeader>
          <DialogTitle>Compare Materials</DialogTitle>
          <DialogDescription>
          Choose to upload or paste text of course materials to compare with guidance provided through the Digital Learning Strategy documents. Files must
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
              <div className="flex justify-between items-center">
                <Label htmlFor="syllabus-text">Enter Text</Label>
                <span className={`text-sm ${wordCount >= MAX_WORD_COUNT * 0.9 ? 'text-red-500' : 'text-gray-500'}`}>
                  {wordCount}/{MAX_WORD_COUNT} words
                </span>
              </div>
              <textarea
                id="syllabus-text"
                value={textSyllabus}
                onChange={handleTextChange}
                className="w-full border p-2 rounded min-h-[150px]"
                placeholder="Paste text here (2000 word limit)"
              />
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="syllabus-upload">Upload File</Label>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                id="syllabus-upload"
                type="file"
                multiple
                onChange={handleFileChange}
                accept=".pdf,.docx,.pptx,.txt,.xlsx,.xps,.mobi,.cbz"
                className="hidden"
              />
              
              {/* Custom file button with file count */}
              <div className="w-full border rounded">
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="w-full p-2 text-left border-0 bg-white rounded flex justify-between items-center"
                >
                  <span className="text-base">Choose Files</span>
                  {files.length > 0 && <span>{files.length} files</span>}
                </button>
              </div>
              
              {files.length > 0 && (
                <div>
                  <p className="mb-2">Selected Files: ({files.length} {files.length === 1 ? 'file' : 'files'})</p>
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
                          onClick={() => removeFile(index)}
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