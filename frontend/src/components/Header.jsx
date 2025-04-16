import React from "react";
import { MdOutlineBackspace } from "react-icons/md";
import { LuListRestart } from "react-icons/lu";

const Header = ({ setPage, onReset }) => {
  return (
    <div className="flex flex-row bg-customMain">
      <div className="flex flex-row justify-between text-white font-bold text-2xl px-4 py-2 ml-4 w-full">
        CANMAT Assistant
        <div className="flex items-center gap-4">
          <div className="relative group">
            <LuListRestart 
              className="hover:cursor-pointer hover:opacity-80" 
              size={26} 
              onClick={onReset}
            />
            <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs py-0.5 px-1.5 rounded -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              Reset conversation
            </div>
          </div>
          
          <div className="relative group">
            <MdOutlineBackspace
              className="hover:cursor-pointer hover:opacity-80"
              size={30}
              onClick={() => setPage("home")}
            />
            <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs py-0.5 px-1.5 rounded -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              Back to home
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;