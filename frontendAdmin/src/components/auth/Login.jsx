import React from "react";
import Header from "../Header";
import Image from "next/image";
const Login = () => {
  return (
    <div className="w-full h-full flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-row flex-grow">
        <div className="flex flex-col items-center bg-adminHome w-1/2">
          <div className="mt-32 relative w-[350px] md:h-[350px]">
            <div className="top-14 left-14 absolute inset-0 bg-white rounded-full w-[240px] md:h-[240px]" />
            <Image
              src="/logo.png"
              alt="logo"
              layout="fill"
              objectFit="contain"
              className="relative z-10"
            />
          </div>
          <div className="text-3xl font-bold">DLS Administrator</div>
        </div>
        <div className="flex flex-col w-1/2">
          <div>input</div>
        </div>
      </div>
    </div>
  );
};

export default Login;
