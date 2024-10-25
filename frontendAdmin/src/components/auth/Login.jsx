import React from "react";
import Header from "../Header";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
const Login = () => {
  return (
    <div className="w-full h-full flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-row flex-grow">
        <div className="flex flex-col items-center bg-adminHome w-1/2">
          <div className="mt-52 relative w-[350px] md:h-[350px]">
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
        <div className="bg-white w-full md:w-1/2 p-8 flex items-center justify-center">
          <div className="w-full max-w-md">
            <h2 className="text-2xl mb-6">Sign in</h2>
            <form className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email address
                </label>
                <Input
                  type="email"
                  id="email"
                  defaultValue="email@gmail.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <Input
                  type="password"
                  id="password"
                  defaultValue="********"
                  className="mt-1"
                />
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  <a href="#" className="text-blue-600 hover:underline">
                    Forgot Password
                  </a>
                </p>
              </div>
              <Button className="w-full bg-blue-900 hover:bg-blue-800 text-md">
                SIGN IN
              </Button>
            </form>
            <div className="mt-2">
              <p className="text-sm text-gray-600">
                Don't have an account? {" "}
                <a href="#" className="text-blue-600 hover:underline">
                  Sign up
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
