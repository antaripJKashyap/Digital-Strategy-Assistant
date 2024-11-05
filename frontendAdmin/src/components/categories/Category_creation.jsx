"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { fetchAuthSession } from "aws-amplify/auth";

const allowed_document_types = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-xpsdocument",
  "application/x-mobi8",
  "application/epub+zip",
  "application/zip",
];

export default function Category_creation({
  setSelectedPage,
  nextCategoryNumber,
  setNextCategoryNumber,
}) {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  function removeFileExtension(fileName) {
    return fileName.replace(/\.[^/.]+$/, "");
  }

  const getFileType = (filename) => {
    const parts = filename.split(".");
    if (parts.length > 1) {
      return parts.pop();
    } else {
      return "";
    }
  };

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
      const fileExtension = file.type;

      // Check if the file type is allowed
      if (!allowed_document_types.includes(fileExtension)) {
        toast.error(`${file.name} is not an allowed document type.`);
        return false;
      }

      // Check for duplicate file names
      const isDuplicate = files.some(
        (existingFile) => existingFile.name === file.name
      );
      if (isDuplicate) {
        toast.error(`${file.name} is already uploaded.`);
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
    URL.revokeObjectURL(url);
  };

  const createCategory = async (token) => {
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_ENDPOINT
      }admin/create_category?category_name=${encodeURIComponent(
        categoryName
      )}&category_number=${encodeURIComponent(nextCategoryNumber)}`,
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) throw new Error("Category creation failed");
    const data = await response.json();
    return data;
  };

  const generatePresignedUrl = async (file, categoryId, token) => {
    const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_ENDPOINT
      }admin/generate_presigned_url?category_id=${encodeURIComponent(
        categoryId
      )}&document_type=${encodeURIComponent(
        getFileType(fileName)
      )}&document_name=${encodeURIComponent(removeFileExtension(fileName))}`,
      {
        method: "GET",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) throw new Error("Failed to generate presigned URL");
    const data = await response.json();
    const url = data.presignedurl;
    console.log("url", url);
    return url;
  };

  const uploadFile = async (file, presignedUrl) => {
    await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });
  };

  const uploadFiles = async () => {
    if (isUploading) return;
    if (!categoryName.trim()) {
      toast.error("Category name is required.");
      return;
    }

    setIsUploading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      // Step 1: Create Category
      const { category_id } = await createCategory(token);
      console.log(category_id);
      // Step 2: Upload Files
      await Promise.all(
        files.map(async (file) => {
          const presigned_url = await generatePresignedUrl(
            file,
            category_id,
            token
          );
          console.log(presigned_url);
          await uploadFile(file, presigned_url);
        })
      );
    } catch (error) {
      toast.error("Category creation or file upload failed.", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.error("Upload error:", error);
    } finally {
      toast.success("Category created and files uploaded successfully.");
      setFiles([]);
      setCategoryName("");
      setSelectedPage("categories");
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Category Name</Label>
        <Input
          id="name"
          placeholder="Name"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Add Documents</Label>
        <Label htmlFor="dropzone-file" className="w-full">
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
                accept=".pdf,.docx,.pptx,.txt,.xlsx,.xps,.mobi,.cbz"
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
            onClick={() => setSelectedPage("categories")}
            className="bg-adminMain hover:bg-[#000060] px-8"
          >
            Cancel
          </Button>
        </div>
        <Button
          className="px-8 bg-adminMain hover:bg-[#000060]"
          onClick={uploadFiles}
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
