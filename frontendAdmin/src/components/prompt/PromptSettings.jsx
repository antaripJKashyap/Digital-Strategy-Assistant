// PublicPromptSettings.js
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PreviousPrompts from "./PreviousPrompts";

const PromptSettings = ({ promptId }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{promptId} Prompt Settings</CardTitle>{" "}
        {/* Use promptId as title */}
        <CardDescription>
          Warning: modifying the prompt in the text area below can significantly
          impact the quality and accuracy of the responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm" htmlFor={`prompt-${promptId}`}>
            Your Prompt
          </Label>
          <textarea
            id={`prompt-${promptId}`}
            placeholder="Type your text here..."
            className="min-h-[5rem] w-full md:min-h-[9rem] xl:min-h-[11rem] resize-none overflow-y-auto border p-2 rounded"
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-center">
        <div className="flex flex-col ">
          <PreviousPrompts />
          <Button className="bg-adminMain hover:hover:bg-[#000060]">
            Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default PromptSettings;
