"use client";
import React, { useState } from "react";
import PublicHome from "./PublicHome";
import Chat from "../chat/Chat";

const GeneralPublic = () => {
  const [page, setPage] = useState("home");
  if (page === "home") {
    return <PublicHome setPage={setPage} />;
  } else {
    return <Chat setPage={setPage} />;
  }
};

export default GeneralPublic;
