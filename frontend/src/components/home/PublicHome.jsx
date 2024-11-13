import React from "react";
import Header from "../Header";
import Image from "next/image";
import { PiHeadCircuitLight } from "react-icons/pi";
import { IoIosColorWand } from "react-icons/io";
import { LiaClipboardListSolid } from "react-icons/lia";
import { FaGears } from "react-icons/fa6";
import Footer from "../Footer";
import { Button } from "../ui/button";

const PublicHome = ({ setPage }) => {
  return (
    <div className="w-full min-h-screen flex flex-col">
      <div className="flex-grow">
        <Header setPage={setPage}/>
        <div className="flex flex-row justify-center items-center mt-6 md:mt-12 mb-6 md:mb-12">
          <Image
            src="/logo.png"
            alt="logo"
            width={150}
            height={150}
            className="md:w-[150px] md:h-[150px]"
          />
        </div>
        <div className="flex flex-col justify-center items-center text-xl md:text-2xl xl:text-2xl text-gray-700">
          <span>Hi there! I am the DLS Assistant</span>
        </div>
        <div className="flex flex-col justify-center items-center text-lg md:text-xl xl:text-xl mt-2 md:mt-4 text-gray-700">
          <span>I can help you</span>
        </div>
        <div className="flex flex-col justify-center items-center mt-6 md:mt-8 space-y-3 md:space-y-4 xl:space-y-4">
          <div className="bg-customAccent py-3 px-4 text-md md:text-lg xl:text-lg flex flex-row gap-2 md:gap-4 xl:gap-4 w-10/12 md:w-4/12 xl:w-3/12 rounded-lg shadow-md">
            <PiHeadCircuitLight size={25} className="md:size-[30px] xl:size-[30px]" />
            Understand the Digital Learning Strategy
          </div>
          <div className="bg-customAccent py-3 px-4 text-md md:text-lg xl:text-lg flex flex-row gap-2 md:gap-4 xl:gap-4 w-10/12 md:w-4/12 xl:w-3/12 rounded-lg shadow-md">
            <IoIosColorWand size={25} className="md:size-[30px] xl:size-[30px]" />
            Enhance your digital learning experience
          </div>
          <div className="bg-customAccent py-3 px-4 text-md md:text-lg xl:text-lg flex flex-row gap-2 md:gap-4 xl:gap-4 w-10/12 md:w-4/12 xl:w-3/12 rounded-lg shadow-md">
            <LiaClipboardListSolid size={25} className="md:size-[30px] xl:size-[30px]" />
            Improve your course or program design
          </div>
          <div className="bg-customAccent py-3 px-4 text-md md:text-lg xl:text-lg flex flex-row gap-2 md:gap-4 xl:gap-4 w-10/12 md:w-4/12 xl:w-3/12 rounded-lg shadow-md">
            <FaGears size={25} className="md:size-[30px] xl:size-[30px]" />
            Inform your operational decisions
          </div>
        </div>
        <div className="flex flex-col justify-center items-center mt-12 md:mt-16">
          <Button onClick={() => setPage("chat")} className="flex flex-row justify-center items-center bg-customMain hover:bg-customMain/90 py-8 px-4 text-lg md:text-xl xl:text-xl text-white w-8/12 md:w-3/12 xl:w-2/12 rounded-md">
            Get Started
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PublicHome;
