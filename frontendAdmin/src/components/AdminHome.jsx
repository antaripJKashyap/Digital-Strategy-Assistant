"use client";
import React, { useEffect, useState } from "react";
import Login from "./auth/Login.jsx";
import { fetchAuthSession } from "aws-amplify/auth";
import Analytics from "./analytics/Analytics.jsx";
import Categories from "./categories/Categories.jsx";
import Prompt from "./prompt/Prompt.jsx";
import Files from "./files/Files.jsx";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import PostAuthHeader from "./PostAuthHeader.jsx";
import History from "./history/History.jsx";
const AdminHome = () => {
  const [user, setUser] = useState(null);
  const [userGroup, setUserGroup] = useState(null);
  const [selectedPage, setSelectedPage] = useState("analytics");
  useEffect(() => {
    const fetchAuthData = () => {
      fetchAuthSession()
        .then(({ tokens }) => {
          if (tokens && tokens.accessToken) {
            const group = tokens.accessToken.payload["cognito:groups"];
            setUser(tokens.accessToken.payload);
            setUserGroup(group || []);
          }
        })
        .catch((error) => {
          console.log(error);
        });
    };

    fetchAuthData();
  }, []);

  const getHomePage = () => {
    if (userGroup && userGroup.includes("admin")) {
      switch (selectedPage) {
        case "analytics":
          return <Analytics />;
        case "categories":
          return <Categories />;
        case "prompt":
          return <Prompt />;
        case "history":
          return <History />;
        case "files":
          return <Files />;
        default:
          return <Analytics />;
      }
    } else {
      return <Login />;
    }
  };
  if (userGroup && userGroup.includes("admin")) {
    return (
      <div className="flex min-h-screen flex-col">
        <PostAuthHeader page={selectedPage} />
        <div className="flex flex-1">
          <Sidebar
            selectedPage={selectedPage}
            setSelectedPage={setSelectedPage}
          />
          {getHomePage()}
        </div>
      </div>
    );
  } else {
    return <Login />;
  }
};

export default AdminHome;
