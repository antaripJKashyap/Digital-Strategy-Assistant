"use client"
import React from "react";
import { tailChase } from "ldrs";

tailChase.register()
const Loading = () => {
  return (
    <div className="flex items-center justify-center h-[80vh] w-screen">
      <l-tail-chase size="150" speed="1.8" color="#ADD8E6"></l-tail-chase>
    </div>
  );
};

export default Loading;
