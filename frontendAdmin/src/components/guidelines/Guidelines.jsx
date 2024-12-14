import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Save } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";

const Guidelines = () => {
  const [guidelines, setGuidelines] = useState([]);
  const [currentGuideline, setCurrentGuideline] = useState({
    header: "",
    points: [""],
  });
  const [editingIndex, setEditingIndex] = useState(null);

  const fetchGuidelines = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/guidelines`,
        {
          method: "GET",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const formattedGuidelines = data.guidelines.map((g) => ({
          header: g.header,
          points: g.body.split("\n").filter((point) => point.trim() !== ""),
        }));
        setGuidelines(formattedGuidelines);
      }
    } catch (error) {
      console.error("Failed to fetch guidelines", error);
    }
  };

  useEffect(() => {
    fetchGuidelines();
  }, []);

  const handleHeaderChange = (e) => {
    setCurrentGuideline((prev) => ({ ...prev, header: e.target.value }));
  };

  const handlePointChange = (index, value) => {
    const newPoints = [...currentGuideline.points];
    newPoints[index] = value;
    setCurrentGuideline((prev) => ({ ...prev, points: newPoints }));
  };

  const addPoint = () => {
    setCurrentGuideline((prev) => ({ ...prev, points: [...prev.points, ""] }));
  };

  const removePoint = (index) => {
    const newPoints = currentGuideline.points.filter((_, i) => i !== index);
    setCurrentGuideline((prev) => ({ ...prev, points: newPoints }));
  };

  const saveGuidelines = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/guidelines`, {
        method: "DELETE",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      });

      const insertPromises = guidelines.map((guideline) =>
        fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/guidelines?header=${encodeURIComponent(guideline.header)}`, {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: guideline.points.join("\n"),
          }),
        })
      );

      await Promise.all(insertPromises);

      fetchGuidelines();
    } catch (error) {
      console.error("Failed to save guidelines", error);
    }
  };

  const addGuideline = () => {
    if (currentGuideline.header.trim() === "") return;

    const newGuidelines =
      editingIndex !== null
        ? guidelines.map((g, idx) =>
            idx === editingIndex ? currentGuideline : g
          )
        : [...guidelines, currentGuideline];

    setGuidelines(newGuidelines);
    setCurrentGuideline({ header: "", points: [""] });
    setEditingIndex(null);
  };

  const editGuideline = (index) => {
    setCurrentGuideline(guidelines[index]);
    setEditingIndex(index);
  };

  const removeGuideline = (index) => {
    const newGuidelines = guidelines.filter((_, i) => i !== index);
    setGuidelines(newGuidelines);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="w-full mb-6">
        <CardHeader>
          <CardTitle>Create Guideline</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Guideline Header"
            value={currentGuideline.header}
            onChange={handleHeaderChange}
            className="mb-4"
          />
          {currentGuideline.points.map((point, index) => (
            <div key={index} className="flex items-center space-x-2 mb-2">
              <Textarea
                placeholder={`Point ${index + 1}`}
                value={point}
                onChange={(e) => handlePointChange(index, e.target.value)}
                className="flex-grow"
              />
              {currentGuideline.points.length > 1 && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => removePoint(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" onClick={addPoint}>
              <Plus className="mr-2 h-4 w-4" /> Add Point
            </Button>
            <Button onClick={addGuideline} disabled={!currentGuideline.header}>
              {editingIndex !== null ? "Update Guideline" : "Add Guideline"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Existing Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          {guidelines.map((guideline, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 mb-4 flex flex-col"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">{guideline.header}</h3>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => editGuideline(index)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => removeGuideline(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {guideline.points.map((point, pointIndex) => (
                <p key={pointIndex} className="text-sm mb-1">
                  {point}
                </p>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="fixed bottom-8 right-8">
        <Button
          size="lg"
          onClick={saveGuidelines}
          disabled={guidelines.length === 0}
        >
          <Save className="mr-2 h-4 w-4" /> Save Guidelines
        </Button>
      </div>
    </div>
  );
};

export default Guidelines;
