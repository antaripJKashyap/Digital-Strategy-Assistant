"use client";
import React, { useState } from "react";
import Header from "../Header";
import Image from "next/image";
import SignIn from "./SignIn";
import SignUp from "./SignUp";
import SignupConfirmation from "./SignupConfirmation";
import ForgotPassword from "./ForgotPassword";
import PasswordReset from "./PasswordReset";
const Auth = () => {
  const [authState, setAuthState] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="w-full h-screen flex flex-col">
      <Header />
      <div className="flex flex-grow">
        <div className="flex flex-col items-center justify-center bg-adminHome w-full md:w-1/2 h-full">
          <div className="relative w-[350px] md:h-[350px]">
            <div className="top-14 left-14 absolute inset-0 bg-white rounded-full w-[240px] md:h-[240px]" />
            <Image
              src="/logo.png"
              alt="logo"
              layout="fill"
              objectFit="contain"
              className="relative z-10"
            />
          </div>
          <div className="text-3xl font-bold mt-4">DLS Administrator</div>
        </div>
        <div className="bg-white w-full md:w-1/2 p-8 flex items-center justify-center">
          {authState === "signin" && (
            <SignIn
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "signup" && (
            <SignUp
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "forgotPassword" && (
            <ForgotPassword
              email={email}
              setEmail={setEmail}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "signupConfirmation" && (
            <SignupConfirmation
              email={email}
              setAuthState={setAuthState}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          {authState === "passwordReset" && (
            <PasswordReset email={email} loading={loading} setLoading={setLoading} setAuthState={setAuthState} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
