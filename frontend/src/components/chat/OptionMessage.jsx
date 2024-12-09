import React from "react";

const OptionMessage = ({ text, onClick, icon: Icon }) => {
  return (
    <button
      className="flex flex-row mt-3 pl-4 pr-8 py-2 whitespace-pre-line bg-customMessage border border-customMain rounded-md w-fit text-md"
      onClick={onClick}
    >
      {text}
      {Icon && <Icon className="mt-0.5 text-lg ml-1" />}
    </button>
  );
};

export default OptionMessage;
