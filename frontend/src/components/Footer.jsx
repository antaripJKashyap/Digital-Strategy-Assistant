import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Footer = () => {
  return (
    <div className="flex flex-row bg-customFooter py-2">
      <div className="flex flex-row justify-between w-full mx-4">
        <Dialog>
          <DialogTrigger className="underline text-gray-700 hover:text-gray-900 cursor-pointer">
            About
          </DialogTrigger>
          <DialogContent className="max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold mb-4">
                About the Digital Strategy Assistant
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                The Digital Learning Strategy Assistant (DSA) is an AI-powered
                tool designed to help educators and institutions enhance their
                digital learning capabilities.
              </p>
              <p className="text-gray-700">
                Our platform provides guidance on implementing effective digital
                learning strategies, improving course design, and making
                data-driven decisions for better educational outcomes.
              </p>
              <p className="text-gray-700">
                Created with the goal of making digital education more
                accessible and effective, the Digital Strategy Assistant serves as your
                personal consultant for all aspects of digital learning.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger className="underline text-gray-700 hover:text-gray-900 cursor-pointer">
            T&C
          </DialogTrigger>
          <DialogContent className="max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold mb-4">
                Terms & Conditions
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                By using the Digital Strategy Assistant, you agree to the following terms and
                conditions:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>
                  This tool is provided for educational and informational
                  purposes only.
                </li>
                <li>
                  All recommendations should be reviewed and adapted to your
                  specific context.
                </li>
                <li>
                  User data is handled in accordance with our privacy policy.
                </li>
                <li>The service is provided "as is" without any warranties.</li>
                <li>
                  We reserve the right to modify or discontinue the service at
                  any time.
                </li>
              </ul>
              <p className="text-gray-700">
                For full terms and conditions, please contact your
                administrator.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Footer;
