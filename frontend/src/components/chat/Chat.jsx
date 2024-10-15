import React, { useState, useRef } from "react";
import Header from "../Header";
import MainMessage from "./MainMessage";
import OptionMessage from "./OptionMessage";
import UserMessage from "./UserMessage";
import Footer from "../Footer";
import { LuSendHorizonal } from "react-icons/lu";
import { LuListRestart } from "react-icons/lu";

const Chat = ({ setPage }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      message: "Hello, how are you?",
      time: "10:00",
    },
    {},
  ]);

  const messagesEndRef = useRef(null);

  return (
    <div className="w-full h-screen flex flex-col">
      <Header setPage={setPage} />
      <div className="flex-grow overflow-y-auto pt-8 flex flex-col">
        <div className="flex-grow px-8 flex flex-col overflow-y-auto">
          <MainMessage
            text={`Please select the best role below that fits you. We can better answer your questions.
                
                Don't include personal details such as your name and private content.`}
          />
          <OptionMessage text={`Student/prospective student`} />
          <OptionMessage text={`Educator/educational designer`} />
          <UserMessage text={"Student/prospective student"} />
          {/* Example of multiple messages */}
          <MainMessage
            text={`Please select the best role below that fits you. We can better answer your questions.
                
                Don't include personal details such as your name and private content.`}
          />
          <OptionMessage text={`Student/prospective student`} />
          <OptionMessage text={`Educator/educational designer`} />
          <UserMessage text={"Student/prospective student"} />
          <MainMessage
            text={`Please select the best role below that fits you. We can better answer your questions.
                
                Don't include personal details such as your name and private content.`}
          />
          <OptionMessage text={`Student/prospective student`} />
          <OptionMessage text={`Educator/educational designer`} />
          <UserMessage text={"Student/prospective student"} />
          <div className="mb-8">

          </div>
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col">
        <div className="border-t border-b border-black w-full flex items-center justify-between px-8">
          <LuListRestart size={20} />
          <textarea
            className="px-4 py-2 text-md w-full bg-white text-black resize-none overflow-hidden focus:outline-none"
            placeholder="Type a message..."
            maxLength={2096}
            style={{ minHeight: "40px" }} // Set a minimum height
            rows={1} // Start with 1 row
            onInput={(e) => {
              e.target.style.height = "auto"; // Reset height
              e.target.style.height = `${Math.max(
                e.target.scrollHeight,
                48
              )}px`; // Set height based on content with min height
            }}
          />
          <LuSendHorizonal size={20} />
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default Chat;
