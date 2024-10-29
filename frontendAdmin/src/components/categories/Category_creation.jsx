'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, X, Download } from "lucide-react"
import { useState } from "react"

export default function Category_creation() {
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...droppedFiles])
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files) {
      const uploadedFiles = Array.from(e.target.files)
      setFiles(prev => [...prev, ...uploadedFiles])
    }
  }

  const removeFile = (fileName) => {
    setFiles(files.filter(file => file.name !== fileName))
  }

  const downloadFile = (file) => {
    const blob = new Blob([file], { type: file.type })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement("a")
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    URL.revokeObjectURL(url) // Clean up the URL
  }

  return (
    <div className="w-full max-w-md mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Title/Name</Label>
        <Input id="name" placeholder="Name" />
      </div>

      <div className="space-y-2">
        <Label>Add Slides</Label>
        <div
          className={`border-2 border-dashed rounded-lg p-6 ${
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
              <Label
                htmlFor="dropzone-file"
                className="cursor-pointer text-sm text-muted-foreground hover:text-primary"
              >
                Click to upload
              </Label>
              <p className="text-xs text-muted-foreground">
                or drag and drop
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              SVG, PNG, JPG or GIF (max. 3MB)
            </p>
            <Input
              id="dropzone-file"
              type="file"
              className="hidden"
              multiple
              onChange={handleChange}
            />
          </div>
        </div>

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

      <Button className="w-full" type="submit">
        Save
      </Button>
    </div>
  )
}
