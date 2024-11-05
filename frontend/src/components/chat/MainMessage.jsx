import React from "react";
import Image from "next/image";

const MainMessage = ({ text }) => {
  return (
    <div>
    <div className="mt-4 mb-2 pl-4 pr-8 py-4 whitespace-pre-line bg-customMessage w-9/12 border border-customMain rounded-tr-lg rounded-br-lg rounded-bl-lg">
      <Image
        className="mb-2"
        src="/logo.png"
        alt="logo"
        width={40}
        height={40}
      />
      <div className="text-md">{text}</div>
    </div>
    </div>
  );
};

export default MainMessage;
