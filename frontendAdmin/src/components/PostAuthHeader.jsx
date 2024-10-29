import React from "react";
import { signOut } from "aws-amplify/auth";
const PostAuthHeader = ({ page }) => {
  const headerMapping = (page) => {
    switch (page) {
      case "analytics":
        return "Administrator Dashboard";
      case "categories":
        return "Edit Categories";
      case "history":
        return "View History";
      case "prompt":
        return "Edit Prompt";
      case "files":
        return "Files";
      default:
        return "Administrator Dashboard";
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.log("error signing out: ", error);
    }
  };
  return (
    <div className="mb-4">
      <div className="bg-adminMain py-6 mb-4"></div>
      <div className="flex flex-row justify-between px-6">
        <h1 className="text-center text-3xl font-bold">
          {headerMapping(page)}
        </h1>
        <button onClick={handleSignOut}>sign out</button>
      </div>
    </div>
  );
};

export default PostAuthHeader;
