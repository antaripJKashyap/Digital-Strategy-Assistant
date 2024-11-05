"use client";
import React, { useState } from "react";
import Header from "../Header";
import Image from "next/image";
import { PiHeadCircuitLight } from "react-icons/pi";
import { IoIosColorWand } from "react-icons/io";
import { LiaClipboardListSolid } from "react-icons/lia";
import { FaGears } from "react-icons/fa6";
import Footer from "../Footer";
import { Button } from "../ui/button";
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
