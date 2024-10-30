"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify"; // Ensure you have this installed for toast notifications

const allowed_document_types = [
  "application/pdf", // PDF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/vnd.ms-powerpoint", // PPTX
  "text/plain", // TXT
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
  "application/vnd.ms-xpsdocument", // XPS
  "application/x-mobi8", // MOBI
  "application/epub+zip", // EPUB
  "application/zip", // CBZ
];

export default function Edit_Category() {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndSetFiles(droppedFiles);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files) {
      const uploadedFiles = Array.from(e.target.files);
      validateAndSetFiles(uploadedFiles);
    }
  };

  const validateAndSetFiles = (filesToUpload) => {
    const validFiles = filesToUpload.filter((file) => {
      const fileExtension = file.type; // Using file.type for validation
      if (!allowed_document_types.includes(fileExtension)) {
        toast.error(`${file.name} is not an allowed document type.`);
        return false;
      }
      return true;
    });

    setFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (fileName) => {
    setFiles(files.filter((file) => file.name !== fileName));
  };

  const downloadFile = (file) => {
    const blob = new Blob([file], { type: file.type });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url); // Clean up the URL
  };

  return (
    <div className="w-full mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Category Name</Label>
        <Input id="name" placeholder="Name" />
      </div>

      <div className="space-y-2">
        <Label>Add Documents</Label>
        <Label htmlFor="dropzone-file" className={`w-full`}>
          <div
            className={`border-2 border-dashed rounded-lg p-6 cursor-pointer ${
              dragActive ? "border-primary bg-primary/10" : "border-muted"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="flex flex-col space-y-1">
                <p className="cursor-pointer text-sm text-muted-foreground hover:text-primary">
                  Click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  or drag and drop
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, PPTX, TXT, XLSX, XPS, MOBI, CBZ, etc.
              </p>
              <Input
                id="dropzone-file"
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.pptx,.txt,.xlsx,.xps,.mobi,.cbz" // Set allowed file types
                onChange={handleChange}
              />
            </div>
          </div>
        </Label>

        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 border rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <div className="flex flex-col">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(file.name)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove file</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => downloadFile(file)}
                >
                  <Download className="h-4 w-4" />
                  <span className="sr-only">Download file</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-row justify-between">
        <div className="flex flex-row gap-x-8">
          <Button
            className="bg-adminMain hover:bg-[#000060] px-8"
            type="submit"
          >
            Cancel
          </Button>
          <Button
            className="bg-red-700 hover:bg-red-800 px-8"
            type="submit"
          >
            Delete Category
          </Button>
        </div>
        <Button
          className="px-8 bg-adminMain hover:bg-[#000060]"
          type="submit"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
