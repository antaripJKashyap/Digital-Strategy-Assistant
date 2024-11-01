"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "react-toastify";
import { fetchAuthSession } from "aws-amplify/auth";
import Loading from "../Loading/Loading";
const Files = () => {
  const [categories, setCategories] = useState([]);
  const [filesByCategory, setFilesByCategory] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true); 
      try {
        const session = await fetchAuthSession();
        const token = session.tokens.idToken;
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
          setCategories(data);
          await fetchFilesForCategories(data);
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
  }, []);

  // Fetch files for each category
  const fetchFilesForCategories = async (categories) => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken;

    const filesData = {};

    // Fetch files for each category
    for (const category of categories) {
      try {
        const response = await fetch(
          `${
            process.env.NEXT_PUBLIC_API_ENDPOINT
          }admin/files_within_category?category_id=${encodeURIComponent(
            category.category_id
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

          const documentFilesArray = Object.entries(data.document_files).map(
            ([fileName, fileDetails]) => ({
              name: fileName,
              ...fileDetails,
            })
          );

          filesData[category.category_id] = await Promise.all(
            documentFilesArray.map(async (file) => {
              const fileResponse = await fetch(file.url);
              const blobData = await fileResponse.blob();
              return new File([blobData], file.name, { type: blobData.type });
            })
          );
        } else {
          toast.error(`Failed to fetch files for category: ${category.name}`);
        }
      } catch (error) {
        console.error(
          `Error fetching files for category ${category.name}:`,
          error
        );
      }
    }

    setFilesByCategory(filesData);
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

  if (loading) {
    return <Loading />
  }

  return (
    <div className="w-full mx-auto p-4 space-y-6">
      {categories.map((category) => (
        <div key={category.category_id} className="border-b pb-4">
          <h2 className="text-lg font-semibold mb-2">
            {category.category_name.replace(/\b\w/g, (char) =>
              char.toUpperCase()
            )}
          </h2>
          {filesByCategory[category.category_id] &&
            filesByCategory[category.category_id].map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg mb-2 mr-32"
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
                    onClick={() => downloadFile(file)}
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download file</span>
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};

export default Files;
