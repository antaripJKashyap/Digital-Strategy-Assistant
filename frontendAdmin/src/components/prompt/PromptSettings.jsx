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
        <CardTitle>{promptId} Prompt Settings</CardTitle> {/* Use promptId as title */}
        <CardDescription>
          Warning: modifying the prompt in the text area below can significantly impact the quality and accuracy of the responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`prompt-${promptId}`}>Your Prompt</Label>
          <textarea
            id={`prompt-${promptId}`}
            placeholder="Type your text here..."
            className="min-h-48 w-full resize-none overflow-hidden border p-2 rounded"
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-center">
        <div className="flex flex-col ">
          <PreviousPrompts />
          <Button>Save</Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default PromptSettings;
