"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Download, Trash } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import "react-toastify/dist/ReactToastify.css";
import { fetchAuthSession } from "aws-amplify/auth";
import LoadingScreen from "../Loading/LoadingScreen";

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

export default function Edit_Category({ setSelectedPage, selectedCategory }) {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [newFiles, setNewFiles] = useState([]);
  const [deletedFiles, setDeletedFiles] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchFiles = async () => {
      setLoadingFiles(true);
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }admin/files_within_category?category_id=${encodeURIComponent(
          selectedCategory.category_id
        )}`,
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
        const filesData = data.document_files;
        console.log(filesData);
        const tempFiles = [];

        for (const fileName in filesData) {
          const file = filesData[fileName];
          const response = await fetch(file.url);
          const data = await response.blob();
          const fileObject = new File([data], fileName, {
            type: data.type,
          });
          tempFiles.push(fileObject);
          setMetadata((prev) => ({ ...prev, [fileName]: file.metadata }));
        }
        setFiles((prevFiles) => {
          const combinedFiles = [...prevFiles, ...tempFiles];
          const uniqueFiles = Array.from(
            new Set(combinedFiles.map((file) => file.name))
          ).map((name) => combinedFiles.find((file) => file.name === name));

          return uniqueFiles;
        });
        setLoadingFiles(false);
      } else {
        toast.error("Failed to fetch files.");
        setLoadingFiles(false);
      }
    };

    fetchFiles();
  }, [selectedCategory]);

  useEffect(() => {
    // Populate category name from selectedCategory prop
    if (selectedCategory) {
      setCategoryName(selectedCategory.category_name || "");
    }
  }, [selectedCategory]);

  const cleanFileName = (fileName) => {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  };
  const updateMetaData = async (files, category_id) => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken;
    files.forEach((file) => {
      const fileNameWithExtension = file.fileName || file.name;
      const fileMetadata = metadata[fileNameWithExtension] || "";
      const fileName = cleanFileName(
        removeFileExtension(fileNameWithExtension)
      );
      const fileType = getFileType(fileNameWithExtension);
      return fetch(
        `${
          process.env.NEXT_PUBLIC_API_ENDPOINT
        }admin/update_metadata?category_id=${encodeURIComponent(
          category_id
        )}&document_name=${encodeURIComponent(
          fileName
        )}&document_type=${encodeURIComponent(fileType)}`,
        {
          method: "PUT",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ metadata: fileMetadata }),
        }
      );
    });
  };

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
    const existingFileNames = new Set(
      [...files, ...newFiles].map((file) => file.name)
    );
    const validFiles = filesToUpload.filter((file) => {
      if (!allowed_document_types.includes(file.type)) {
        toast.error(`${file.name} is not an allowed document type.`);
        return false;
      }
      if (existingFileNames.has(file.name)) {
        toast.error(`${file.name} is already uploaded.`);
        return false;
      }
      return true;
    });

    // Update the state with valid files that are not duplicates
    setNewFiles((prevNewFiles) => [...prevNewFiles, ...validFiles]);
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

  const deleteCategory = async (token) => {
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_ENDPOINT
      }admin/delete_category?category_id=${encodeURIComponent(
        selectedCategory.category_id
      )}`,
      {
        method: "DELETE",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) throw new Error("Failed to delete category");
    return await response.json();
  };

  const DeleteTrigger = async () => {
    if (isDeleting) return;
    if (!categoryName.trim()) {
      toast.error("Category name is required.");
      return;
    }

    setIsDeleting(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      // Step 1: Delete Category if applicable
      await deleteCategory(token);

      // Step 2: Upload Files (Add your upload logic here)
      // Example: await uploadFilesLogic(files, token);

      toast.success("Category deleted successfully.");
      setFiles([]);
      setCategoryName("");
      setSelectedPage("categories");
    } catch (error) {
      toast.error("Operation failed.", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.error("Error:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMetadataChange = (fileName, value) => {
    setMetadata((prev) => ({ ...prev, [fileName]: value }));
  };

  const handleRemoveFile = (fileName) => {
    setFiles((prevFiles) => prevFiles.filter((file) => file.name !== fileName));
    setDeletedFiles((prevDeletedFiles) => [...prevDeletedFiles, fileName]);
  };

  const updateCategoryName = async (categoryName, token) => {
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_ENDPOINT
      }admin/edit_category?category_id=${encodeURIComponent(
        selectedCategory.category_id
      )}&category_name=${encodeURIComponent(
        categoryName
      )}&category_number=${encodeURIComponent(
        selectedCategory.category_number
      )}`,
      {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) throw new Error("Failed to delete category");
    return await response.json();
  }

  const handleSaveChanges = async () => {
    setSaving(true);
    const session = await fetchAuthSession();
    const token = session.tokens.idToken;

    try {
      // Step 1: Delete the files
      const deleteFilePromises = deletedFiles.map((fileName) => {
        return fetch(
          `${
            process.env.NEXT_PUBLIC_API_ENDPOINT
          }admin/delete_file?category_id=${encodeURIComponent(
            selectedCategory.category_id
          )}&document_type=${encodeURIComponent(
            getFileType(fileName)
          )}&document_name=${encodeURIComponent(
            removeFileExtension(fileName)
          )}`,
          {
            method: "DELETE",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
          }
        ).then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to delete ${fileName}`);
          }
          return response.json();
        });
      });

      await Promise.all(deleteFilePromises);

      // Step 2: Upload the new files using presigned URLs
      const uploadFilePromises = newFiles.map(async (file) => {
        const presignedUrl = await generatePresignedUrl(
          file,
          selectedCategory.category_id,
          token
        );
        console.log(presignedUrl); // Log the presigned URL for debugging
        await uploadFile(file, presignedUrl);
      });

      await Promise.all(uploadFilePromises);

      // Step 3: Update the metadata
      await updateMetaData(files, selectedCategory.category_id);
      await updateMetaData(newFiles, selectedCategory.category_id);

      // Step 4: Update the category name
      await updateCategoryName(
        categoryName,
        token
      );

      //step 5: cleanup
      toast.success("Changes saved successfully!");
      setDeletedFiles([]);
      const tempNewFiles = newFiles;
      setNewFiles([]);
      setFiles((prevFiles) => [...prevFiles, ...tempNewFiles]);
    } catch (error) {
      toast.error("Failed to save changes.", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  // Assuming generatePresignedUrl and uploadFile are defined as before
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
    console.log("Generated presigned URL:", url); // Log the presigned URL for debugging
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
  if (loadingFiles) {
    return <LoadingScreen />;
  }

  return (
    <div className="w-full mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Category Name</Label>
        <Input
          id="name"
          placeholder="Name"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          disabled={saving || isDeleting} // Disable input while saving or deleting
          maxLength={100}
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
                PDF, DOCX, PPTX, TXT, XLSX, etc.
              </p>
              <Input
                id="dropzone-file"
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.pptx,.txt,.xlsx"
                onChange={handleChange}
                disabled={saving || isDeleting} // Disable file input while saving or deleting
              />
            </div>
          </div>
        </Label>

        <div className="space-y-2">
          {files.map((file, index) => {
            const fileName = file.fileName || file.name;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-2 border rounded-lg"
              >
                <div className="w-5/12 flex items-center space-x-2 pr-4">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Input
                  type="text"
                  placeholder="File description"
                  className="mt-1 w-full p-1 text-sm border rounded"
                  value={metadata[fileName] || ""}
                  onChange={(e) =>
                    handleMetadataChange(fileName, e.target.value)
                  }
                  maxLength={80}
                />
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(file.name)}
                    disabled={saving || isDeleting} // Disable remove button while saving or deleting
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove file</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadFile(file)}
                    disabled={saving || isDeleting} // Disable download button while saving or deleting
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download file</span>
                  </Button>
                </div>
              </div>
            );
          })}
          {newFiles.map((file, index) => {
            const fileName = file.fileName || file.name;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-2 border rounded-lg"
              >
                <div className="w-5/12 flex items-center space-x-2 pr-4">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Input
                  type="text"
                  placeholder="File description"
                  className="mt-1 w-full p-1 text-sm border rounded"
                  value={metadata[fileName] || ""}
                  onChange={(e) =>
                    handleMetadataChange(fileName, e.target.value)
                  }
                  maxLength={80}
                />
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(file.name)}
                    disabled={saving || isDeleting} // Disable remove button while saving or deleting
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove file</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadFile(file)}
                    disabled={saving || isDeleting} // Disable download button while saving or deleting
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download file</span>
                  </Button>
                </div>
              </div>
            );
          })}
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
          <Dialog>
            <DialogTrigger>
              <Button
                variant="destructive"
                className="bg-red-500 hover:bg-red-600 px-8"
                disabled={saving} // Disable delete button while saving
              >
                {isDeleting ? "Deleting..." : "Delete Category"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this category? This action
                  cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end mt-4">
                <DialogClose asChild>
                  <Button variant="outline" disabled={saving || isDeleting}>
                    Cancel
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    onClick={DeleteTrigger}
                    className="ml-2 bg-red-500 hover:bg-red-600"
                    disabled={saving} // Disable confirmation button while saving
                  >
                    Delete
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <Button
          className="px-8 bg-adminMain hover:bg-[#000060]"
          onClick={handleSaveChanges}
          disabled={isDeleting || saving} // Disable save button while deleting or saving
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
