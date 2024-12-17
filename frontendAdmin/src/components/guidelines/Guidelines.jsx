import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, Save, Edit, Check } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { toast } from "react-toastify";
const Guidelines = () => {
  const [guidelines, setGuidelines] = useState([]);
  const [editingGuideline, setEditingGuideline] = useState(null);
  const textareaRefs = useRef({});
  const [showExample, setShowExample] = useState(false);

  const parseBulletPoints = (text) => {
    const lines = text.split(/\n/); // Split the text into lines
    const points = [];
    let buffer = ""; // Temporary storage for non-bulleted lines

    for (let line of lines) {
      line = line.trim();
      if (line) {
        const match = line.match(/^([\u2022\u2023\u25E6\u2043•*-\s]+)\s*(.+)$/); // Bullet point regex
        if (match) {
          // If there's a bullet point, push the buffered content first (if any)
          if (buffer) {
            points.push(buffer.trim());
            buffer = "";
          }
          points.push(match[2].trim());
        } else {
          // If no bullet point, append to the buffer
          buffer += (buffer ? " " : "") + line;
        }
      }
    }

    // Push any remaining buffered content
    if (buffer) points.push(buffer.trim());

    return points;
  };

  useEffect(() => {
    fetchGuidelines();
  }, []);

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
          id: Math.random().toString(36).substring(7),
          header: g.header,
          body: g.body,
        }));
        setGuidelines(formattedGuidelines);
      }
    } catch (error) {
      console.error("Failed to fetch guidelines", error);
      toast.error("Failed to fetch guidelines");
    }
  };

  const handleHeaderChange = (guidelineId, newHeader) => {
    setGuidelines((prev) =>
      prev.map((guideline) =>
        guideline.id === guidelineId
          ? { ...guideline, header: newHeader }
          : guideline
      )
    );
  };

  const handleBodyChange = (guidelineId, newBody) => {
    setGuidelines((prev) =>
      prev.map((guideline) =>
        guideline.id === guidelineId
          ? { ...guideline, body: newBody }
          : guideline
      )
    );
  };

  const startEditing = (guidelineId) => {
    setEditingGuideline(guidelineId);

    // Delay focus to ensure render is complete
    setTimeout(() => {
      const firstTextarea = textareaRefs.current[`${guidelineId}-body`];
      if (firstTextarea) {
        firstTextarea.focus();
      }
    }, 100);
  };

  const addNewGuideline = () => {
    const newGuideline = {
      id: Math.random().toString(36).substring(7),
      header: "",
      body: "",
    };
    setGuidelines((prev) => [newGuideline, ...prev]);
    startEditing(newGuideline.id);
  };

  const removeGuideline = (guidelineId) => {
    setGuidelines((prev) =>
      prev.filter((guideline) => guideline.id !== guidelineId)
    );
  };

  const saveGuidelines = async () => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken;

      // Delete existing guidelines
      await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}admin/guidelines`, {
        method: "DELETE",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      });

      // Insert new guidelines
      const insertPromises = guidelines.map((guideline) =>
        fetch(
          `${
            process.env.NEXT_PUBLIC_API_ENDPOINT
          }admin/guidelines?header=${encodeURIComponent(guideline.header)}`,
          {
            method: "POST",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              body: guideline.body.trim(),
            }),
          }
        )
      );

      await Promise.all(insertPromises);

      toast.success("Guidelines saved successfully!", {
        position: "top-center",
        autoClose: 3000,
        theme: "colored",
      });

      // Refetch to ensure consistency
      fetchGuidelines();
      setEditingGuideline(null);
    } catch (error) {
      console.error("Failed to save guidelines", error);
      toast.error("Failed to save guidelines");
    }
  };

  const finalizeGuideline = (guidelineId) => {
    const guideline = guidelines.find((g) => g.id === guidelineId);

    if (!guideline || (!guideline.header.trim() && !guideline.body.trim())) {
      removeGuideline(guidelineId); // Remove if empty
    }
    setEditingGuideline(null);
  };

  return (
    <div className="w-full px-4 py-8">
      <div className="max-w-full mx-auto">
        <div className="bg-white  rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Guidelines for Digital Strategy
          </h3>
          <p className="text-gray-600">
            These guidelines help educators and administrators compare their
            educational materials against key accessibility and sustainability
            standards.
          </p>
          <p className="text-gray-600">
            By considering these guidelines, instructors and administrators are
            encouraged to adjust their policies and practices to align with
            digital strategy best practices.
          </p>
          <p className="text-gray-600">
            To help you get started, an example guideline is provided below for
            reference.
          </p>
          <button
            onClick={() => setShowExample(!showExample)}
            className="text-gray-500 text-sm hover:text-gray-700 transition duration-200 focus:outline-none mb-4"
          >
            {showExample ? "Hide Example Guideline" : "Show Example Guideline"}
          </button>
          {showExample && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-lg font-semibold text-gray-800 mb-2">
                Building an Accessible, Affordable, and Sustainable Digital
                Post-Secondary Education
              </h4>
              <p className="text-gray-600 mb-2">
                The digital post-secondary system should be accessible,
                affordable, and sustainable for all people, promoting equitable
                access and success for learners of all backgrounds, contexts,
                and worldviews. To achieve this goal, technology-enhanced
                learning should include:
              </p>
              <ul className="list-disc list-inside text-gray-700">
                <li>
                  Where appropriate, using free and low-cost digital and print
                  materials to minimize the cost of digital post-secondary
                  education for learners. This can contribute to mitigating some
                  aspects of the digital divide.
                </li>
                <li>
                  Adopting approaches to reduce the physical and digital
                  environmental impact associated with digital technologies,
                  such as hardware waste and data storage capacity. For example,
                  through technology borrowing programs (hardware and software)
                  and responsible end-of-life practices for technology.
                </li>
                <li>
                  Offering equitable and inclusive learning opportunities, such
                  as considering part-time options for credentials, synchronous,
                  asynchronous, and hybrid scheduling, accommodations for exams,
                  and physical spaces suitable for online learning, while
                  respecting different pedagogical approaches and the need to
                  meet program objectives and accreditation standards.
                </li>
              </ul>
            </div>
          )}

          <div className="bg-white rounded-lg p-6">
            <div className="flex justify-end items-center mb-6">
              <Button
                onClick={addNewGuideline}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Guideline
              </Button>
            </div>

            {guidelines.length > 0 ? (
              guidelines.map((guideline) => (
                <div
                  key={guideline.id}
                  className="mb-4 border p-8 border-gray-200 rounded-md"
                >
                  {editingGuideline === guideline.id ? (
                    <>
                      <Input
                        placeholder="Guideline Header"
                        value={guideline.header}
                        onChange={(e) =>
                          handleHeaderChange(guideline.id, e.target.value)
                        }
                        className="mb-4 text-lg font-semibold"
                      />
                      <Textarea
                        ref={(el) => {
                          if (el) {
                            textareaRefs.current[`${guideline.id}-body`] = el;
                          }
                        }}
                        placeholder="Enter guideline details with bullet points (•, *, -)"
                        value={guideline.body}
                        onChange={(e) =>
                          handleBodyChange(guideline.id, e.target.value)
                        }
                        className="w-full min-h-[200px]"
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          onClick={() => finalizeGuideline(guideline.id)}
                          className="flex items-center gap-2"
                        >
                          <Check className="h-4 w-4" /> Done
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">
                          {guideline.header}
                        </h3>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => startEditing(guideline.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => removeGuideline(guideline.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {parseBulletPoints(guideline.body).map(
                        (point, pointIndex) => (
                          <p
                            key={pointIndex}
                            className="text-gray-600 mb-1 pl-4 pr-24 relative before:content-['•'] before:absolute before:left-0 before:text-gray-500"
                          >
                            {point}
                          </p>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-600 text-center">
                No guidelines available. Click "Add Guideline" to start.
              </p>
            )}
          </div>

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
      </div>
    </div>
  );
};

export default Guidelines;
