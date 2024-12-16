import React from "react";
import { signOut } from "aws-amplify/auth";
import { Button } from "./ui/button";
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
      case "category_creation":
        return "Create Category";
      case "edit_category":
        return "Edit Category";
      case "guidelines":
        return "Guidelines";
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
    <div className="pb-4 border-b border-gray-200">
      <div className="bg-adminMain py-6 mb-4"></div>
      <div className="flex flex-row justify-between px-6">
        <h1 className="text-center text-3xl font-bold">
          {headerMapping(page)}
        </h1>
        <Button
          className="bg-adminMain hover:bg-adminHover text-white text-md py-4"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default PostAuthHeader;
