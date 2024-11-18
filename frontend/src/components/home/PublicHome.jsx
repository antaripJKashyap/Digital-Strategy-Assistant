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
    <div className="w-full h-screen flex flex-col">
      <Header setPage={setPage} />

      <main className="flex-1 flex flex-col justify-between py-6 md:py-8">
        {/* Top Section: Logo and Welcome Text */}
        <div className="space-y-4 md:space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt="logo"
              width={200}
              height={200}
              className="w-[120px] h-[120px] sm:w-[150px] sm:h-[150px] md:w-[175px] md:h-[175px] lg:w-[200px] lg:h-[200px]
                       object-contain transition-all duration-300"
            />
          </div>

          {/* Welcome Text */}
          <div className="text-center space-y-2">
            <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-gray-700 font-medium">
              <span>Hi there! I am the DLS Assistant</span>
            </div>
            <div className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-700">
              <span>I can help you</span>
            </div>
          </div>
        </div>

        {/* Middle Section: Feature Cards */}
        <div className="flex-1 flex flex-col justify-center my-6 md:my-8">
          <div className="space-y-3 md:space-y-4">
            {[
              {
                icon: (
                  <PiHeadCircuitLight className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                ),
                text: "Understand the Digital Learning Strategy",
              },
              {
                icon: (
                  <IoIosColorWand className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                ),
                text: "Enhance your digital learning experience",
              },
              {
                icon: (
                  <LiaClipboardListSolid className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                ),
                text: "Improve your course or program design",
              },
              {
                icon: (
                  <FaGears className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                ),
                text: "Inform your operational decisions",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="mx-auto bg-customAccent py-3 px-4 
                         text-sm sm:text-base md:text-lg 
                         flex flex-row items-center gap-2 sm:gap-3 md:gap-4
                         w-[90%] sm:w-[70%] md:w-[50%] lg:w-[40%] xl:w-[30%]
                         rounded-lg shadow-md transition-all duration-300"
              >
                {item.icon}
                <span className="flex-1">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section: Get Started Button */}
        <div className="flex justify-center mb-6 md:mb-8">
          <Button
            onClick={() => setPage("chat")}
            className="flex justify-center items-center 
                     bg-customMain hover:bg-customMain/90 
                     py-6 md:py-8
                     px-4 
                     text-base sm:text-lg md:text-xl 
                     text-white 
                     w-[80%] sm:w-[60%] md:w-[40%] lg:w-[30%] xl:w-[20%]
                     rounded-md
                     transition-all duration-300 
                     hover:transform hover:scale-105"
          >
            Get Started
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PublicHome;
