"use client";
import React, {useEffect, useState} from "react";
import Login from "./auth/Login.jsx";
import {
  fetchAuthSession,
} from "aws-amplify/auth";
import Analytics from "./analytics/Analytics.jsx";
const AdminHome = () => {
  const [user, setUser] = useState(null);
  const [userGroup, setUserGroup] = useState(null);
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
    if (
      userGroup &&
      (userGroup.includes("admin"))
    ) {
      return <Analytics />;
    } else {
      return <Login />;
    }
  };
  return getHomePage();
};

export default AdminHome;
