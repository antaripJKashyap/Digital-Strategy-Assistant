import React from "react";
import { MdOutlineBackspace } from "react-icons/md";
const Header = ({ setPage }) => {
  return (
    <div className="flex flex-row bg-customMain">
      <div className="flex flex-row justify-between text-white font-bold text-2xl px-4 py-2 ml-4 w-full">
        DLS Assistant
        <MdOutlineBackspace
          className="hover:cursor-pointer"
          size={30}
          onClick={() => setPage("home")}
        />
      </div>
    </div>
  );
};

export default Header;
