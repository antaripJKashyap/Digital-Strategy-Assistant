export const getFileType = (fileName) => {
  const extension = fileName.split(".").pop().toLowerCase();
  const typeMap = {
    pdf: "pdf",
    doc: "doc",
    docx: "docx",
    txt: "txt",
    rtf: "rtf",
  };
  return typeMap[extension] || extension;
};

export const removeFileExtension = (fileName) => {
  return fileName.split(".").slice(0, -1).join(".");
};

export const generatePresignedUrl = async (file, session_id) => {
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/comparison_presigned_url?` +
      `session_id=${encodeURIComponent(session_id)}` +
      `&document_type=${encodeURIComponent(getFileType(fileName))}` +
      `&document_name=${encodeURIComponent(removeFileExtension(fileName))}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) throw new Error("Failed to generate presigned URL");

  const data = await response.json();
  return data.presignedurl;
};

export const uploadFile = async (file, presignedUrl) => {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`File upload failed: ${response.statusText}`);
  }
};

export const processAndUploadFiles = async (
  files,
  textSyllabus,
  session_id
) => {
  // If text syllabus exists, convert to text file
  const processedFiles = textSyllabus.trim()
    ? [
        ...files,
        new File([textSyllabus], "syllabus.txt", { type: "text/plain" }),
      ]
    : files;

  // Validate file sizes
  const oversizedFiles = processedFiles.filter(
    (file) => file.size > 25 * 1024 * 1024
  );
  if (oversizedFiles.length > 0) {
    throw new Error("Files must be less than 25MB");
  }

  // Upload files
  const uploadFilePromises = processedFiles.map(async (file) => {
    const presignedUrl = await generatePresignedUrl(file, session_id);
    await uploadFile(file, presignedUrl);
  });

  await Promise.all(uploadFilePromises);
};

export const getUserRole = (messageHistory) => {
  const firstHumanMessage = messageHistory.find((msg) => msg.Type === "human");
  if (!firstHumanMessage) return "";

  const content = firstHumanMessage.Content.toLowerCase();
  if (content.includes("student")) return "public";
  if (content.includes("educator") || content.includes("educational"))
    return "educator";
  if (content.includes("admin")) return "admin";
  return "";
};
