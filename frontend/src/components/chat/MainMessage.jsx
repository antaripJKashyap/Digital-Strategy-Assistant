import React, { useState, useRef } from "react";
import Image from "next/image";
import Markdown from "react-markdown";
import { Copy, Volume2, StopCircle } from "lucide-react";

const MainMessage = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechSynthesisRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const msg = new SpeechSynthesisUtterance(text);
    msg.onstart = () => setIsSpeaking(true);
    msg.onend = () => setIsSpeaking(false);
    speechSynthesisRef.current = msg;
    window.speechSynthesis.speak(msg);
  };

  // Process the text to identify and handle centered headers
  const processText = (content) => {
    // Check if there are any header_center directives
    if (content.includes("header_center:")) {
      // Split the content to process each line
      return content.split("\n").map((line, i) => {
        if (line.includes("header_center:")) {
          // Extract the header content from the line
          const headerMatch = line.match(/header_center:\s*\*\*(.*?)\*\*/);
          if (headerMatch && headerMatch[1]) {
            // Return a div with the centered header, removing the directive
            return (
              <div key={i} className="text-center font-bold text-xl my-4 mb-6">
                {headerMatch[1]}
              </div>
            );
          }
        }
        // Return regular lines as-is to be processed by Markdown
        return line;
      }).reduce((acc, item, i, arr) => {
        // Join the processed content back together
        if (typeof item === 'string') {
          // If it's a regular string line, add it to the accumulator
          if (acc.length > 0 && typeof acc[acc.length - 1] === 'string') {
            // Join adjacent string lines with newlines
            acc[acc.length - 1] += '\n' + item;
          } else {
            // Start a new string section
            acc.push(item);
          }
        } else {
          // If it's a React element (processed header), add it directly
          acc.push(item);
        }
        return acc;
      }, []);
    }
    
    // If no header_center directives, return the original text
    return content;
  };

  const processedContent = processText(text);

  return (
    <div className="flex flex-col w-9/12">
      <div className="mt-4 mb-2 pl-4 pr-8 py-4 whitespace-pre-line bg-customMessage border border-customMain rounded-tr-lg rounded-br-lg rounded-bl-lg">
        <Image
          className="mb-2"
          src="/logo.png"
          alt="logo"
          width={40}
          height={40}
        />
        
        {Array.isArray(processedContent) ? (
          // If we have pre-processed content with headers
          processedContent.map((item, index) => {
            if (typeof item === 'string') {
              // Render strings through Markdown
              return (
                <Markdown
                  key={index}
                  className="main-message text-md"
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {children}
                      </a>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc main-message">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal main-message">{children}</ol>
                    ),
                    li: ({ children }) => {
                      // Remove any duplicate dash or number prefix
                      const cleanText = typeof children === "string"
                        ? children.replace(/^[-•]\s+/, "").replace(/^\d+\.\s*/, "")
                        : children;

                      return <li className="main-message">{cleanText}</li>;
                    },
                  }}
                >
                  {item}
                </Markdown>
              );
            } else {
              // Render React elements (headers) directly
              return item;
            }
          })
        ) : (
          // Standard Markdown rendering if no preprocessing
          <Markdown
            className="main-message text-md"
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  {children}
                </a>
              ),
              ul: ({ children }) => (
                <ul className="list-disc main-message">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal main-message">{children}</ol>
              ),
              li: ({ children }) => {
                // Remove any duplicate dash or number prefix
                const cleanText = typeof children === "string"
                  ? children.replace(/^[-•]\s+/, "").replace(/^\d+\.\s*/, "")
                  : children;

                return <li className="main-message">{cleanText}</li>;
              },
            }}
          >
            {text}
          </Markdown>
        )}
      </div>
      <div className="flex space-x-4 mt-2 ml-2">
        <button
          onClick={handleCopy}
          className="text-gray-600 hover:text-black transition-colors flex items-center"
          aria-label="Copy message"
        >
          {copied ? (
            <span className="text-xs text-black mr-1">Copied!</span>
          ) : (
            <Copy size={20} className="mr-1" />
          )}
          {!copied && <span className="text-xs">Copy</span>}
        </button>
        <button
          onClick={handleSpeak}
          className="text-gray-600 hover:text-black transition-colors flex items-center"
          aria-label={isSpeaking ? "Stop speaking" : "Read message aloud"}
        >
          {isSpeaking ? (
            <>
              <StopCircle size={20} className="mr-1" />
              <span className="text-xs">Stop</span>
            </>
          ) : (
            <>
              <Volume2 size={20} className="mr-1" />
              <span className="text-xs">Speak</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default MainMessage;