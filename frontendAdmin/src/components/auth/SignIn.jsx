"use client";
import React, { useState } from "react";
import Header from "../Header";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  signIn,
  signUp,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  fetchAuthSession,
} from "aws-amplify/auth";

import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SignIn = ({
  email,
  setEmail,
  password,
  setPassword,
  setAuthState,
  loading,
  setLoading,
}) => {
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signIn({
        username: email,
        password: password,
      });
      
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h2 className="text-2xl mb-6">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          id="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
        />
        <Input
          type="password"
          id="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
        <p className="text-sm text-gray-600">
          <a
            onClick={() => setAuthState("forgotPassword")}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            Forgot Password
          </a>
        </p>
        <Button
          type="submit"
          className="w-full bg-blue-900 hover:bg-blue-800 text-md"
        >
          SIGN IN
        </Button>
      </form>
      <div className="mt-2">
        <p className="text-sm text-gray-600">
          Don't have an account?{" "}
          <a
            onClick={() => setAuthState("signup")}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            Sign up
          </a>
        </p>
      </div>
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  );
};

export default SignIn;
