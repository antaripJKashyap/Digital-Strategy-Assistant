import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Trash2,
  Plus,
  Save,
  Edit,
  Check,
  MoreHorizontal,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { toast } from "react-toastify";
import LoadingScreen from "../Loading/LoadingScreen";

const Guidelines = () => {
  const [criteriaList, setCriteriaList] = useState([]);
  const [collapsedCriteria, setCollapsedCriteria] = useState(new Set()); // Track collapsed criteria
  const [editingCriteria, setEditingCriteria] = useState(null);
  const [editingGuideline, setEditingGuideline] = useState({
    criteriaId: "",
    guidelineId: null,
  });
  const [showExample, setShowExample] = useState(false);
  const [isAddCriteriaModalOpen, setIsAddCriteriaModalOpen] = useState(false);
  const [newCriteriaName, setNewCriteriaName] = useState("");
  const [editingCriteriaName, setEditingCriteriaName] = useState("");
  const [loading, setLoading] = useState(true);
  const textareaRefs = useRef({});

  const toggleExample = () => {
    setShowExample(!showExample);
  };

  const toggleCollapse = (criteriaId) => {
    setCollapsedCriteria((prev) => {
      const updated = new Set(prev);
      if (updated.has(criteriaId)) {
        updated.delete(criteriaId);
      } else {
        updated.add(criteriaId);
      }
      return updated;
    });
  };

  useEffect(() => {
    console.log("criteriaList", criteriaList);
  }, [criteriaList]);

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
        console.log("data", data);

        // Group guidelines by criteria
        const criteriaMap = new Map();

        data.guidelines.forEach((guideline) => {
          const criteriaName = guideline.criteria_name || "Uncategorized";

          if (!criteriaMap.has(criteriaName)) {
            criteriaMap.set(criteriaName, {
              id: Math.random().toString(36).substring(7), // Generate a unique ID for the criteria
              name: criteriaName,
              guidelines: [], // Initialize an empty array for guidelines
            });
          }

          const criteria = criteriaMap.get(criteriaName);
          criteria.guidelines.push({
            id:
              guideline.guideline_id || Math.random().toString(36).substring(7), // Use guideline_id if available, or generate one
            header: guideline.header,
            body: guideline.body,
          });
        });

        // Convert the Map to an array and set it as the criteria list
        setCriteriaList(Array.from(criteriaMap.values()));
      }
    } catch (error) {
      console.error("Failed to fetch guidelines", error);
    } finally {
      setLoading(false);
    }
  };

  const addNewCriteria = () => {
    if (!newCriteriaName.trim()) {
      toast.error("Criteria name cannot be empty");
      return;
    }

    const newCriteria = {
      id: Math.random().toString(36).substring(7),
      name: newCriteriaName.trim(),
      guidelines: [],
    };

    setCriteriaList((prev) => [...prev, newCriteria]);
    setIsAddCriteriaModalOpen(false);
    setNewCriteriaName("");
  };

  const addNewGuidelineForCriteria = (criteriaId) => {
    const newGuideline = {
      id: Math.random().toString(36).substring(7),
      header: "",
      body: "",
    };

    setCriteriaList((prev) =>
      prev.map((criteria) =>
        criteria.id === criteriaId
          ? { ...criteria, guidelines: [newGuideline, ...criteria.guidelines] }
          : criteria
      )
    );

    setEditingGuideline({ criteriaId, guidelineId: newGuideline.id });
  };

  const handleCriteriaNameEdit = () => {
    if (!editingCriteriaName.trim()) {
      toast.error("Criteria name cannot be empty");
      return;
    }

    setCriteriaList((prev) =>
      prev.map((criteria) =>
        criteria.id === editingCriteria
          ? { ...criteria, name: editingCriteriaName.trim() }
          : criteria
      )
    );
    setEditingCriteria(null);
  };

  const removeCriteria = (criteriaId) => {
    setCriteriaList((prev) =>
      prev.filter((criteria) => criteria.id !== criteriaId)
    );
  };

  const handleHeaderChange = (criteriaId, guidelineId, newHeader) => {
    setCriteriaList((prev) =>
      prev.map((criteria) =>
        criteria.id === criteriaId
          ? {
              ...criteria,
              guidelines: criteria.guidelines.map((guideline) =>
                guideline.id === guidelineId
                  ? { ...guideline, header: newHeader }
                  : guideline
              ),
            }
          : criteria
      )
    );
  };

  const handleBodyChange = (criteriaId, guidelineId, newBody) => {
    setCriteriaList((prev) =>
      prev.map((criteria) =>
        criteria.id === criteriaId
          ? {
              ...criteria,
              guidelines: criteria.guidelines.map((guideline) =>
                guideline.id === guidelineId
                  ? { ...guideline, body: newBody }
                  : guideline
              ),
            }
          : criteria
      )
    );
  };

  const removeGuideline = (criteriaId, guidelineId) => {
    setCriteriaList((prev) =>
      prev.map((criteria) =>
        criteria.id === criteriaId
          ? {
              ...criteria,
              guidelines: criteria.guidelines.filter(
                (guideline) => guideline.id !== guidelineId
              ),
            }
          : criteria
      )
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
      const insertPromises = criteriaList.flatMap((criteria) =>
        criteria.guidelines.map((guideline) =>
          fetch(
            `${
              process.env.NEXT_PUBLIC_API_ENDPOINT
            }admin/guidelines?header=${encodeURIComponent(
              guideline.header
            )}&criteria_name=${encodeURIComponent(criteria.name)}`,
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
      setEditingGuideline({ criteriaId: "", guidelineId: null });
    } catch (error) {
      console.error("Failed to save guidelines", error);
      toast.error("Failed to save guidelines");
    }
  };

  const finalizeGuideline = (criteriaId, guidelineId) => {
    setCriteriaList((prev) =>
      prev.map((criteria) => {
        if (criteria.id === criteriaId) {
          const updatedGuidelines = criteria.guidelines.filter((guideline) =>
            guideline.id === guidelineId
              ? guideline.header.trim() || guideline.body.trim()
              : true
          );
          return { ...criteria, guidelines: updatedGuidelines };
        }
        return criteria;
      })
    );
    setEditingGuideline({ criteriaId: "", guidelineId: null });
  };

  if (loading) {
    return <LoadingScreen />;
  }
  return (
    <div className="w-full px-4 py-8">
      <div className="max-w-full mx-auto">
        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Guidelines for Digital Strategy
              </h3>
              <p className="text-gray-600">
                Manage guidelines across different sub-criteria for digital
                strategy. These guidelines will help evaluate course materials
                uploaded by educators and institutional leaders/admins, ensuring
                they align with best practices in technology-enhanced learning
                environments. Each sub-criteria represents an optional set of
                guidelines that users can reference to compare their course
                materials.
              </p>

              {/* Toggle Button for Example */}
              <button
                onClick={toggleExample}
                className="mt-4 text-blue-500 hover:underline"
              >
                {showExample ? "Hide Example" : "Show Example"}
              </button>

              {/* Example Section */}
              {showExample && (
                <div className="mt-6">
                  <h4 className="text-md font-semibold text-gray-800">
                    Example Sub-Criteria: Guidelines for Technology-Enhanced
                    Learning
                  </h4>

                  {/* Example Guideline */}
                  <div className="mt-6">
                    <h4 className="text-md font-semibold text-gray-800">
                      Making the Digital Space Safer
                    </h4>
                    <p className="text-gray-600">
                      The digital post-secondary system should address security,
                      information security, privacy risks, physical, emotional,
                      and psychological safety, and the potential for exposure
                      to prejudice and biases to support wellbeing amongst
                      learners, educators, and staff. This includes complying
                      with applicable privacy and information security
                      legislation and policies. To achieve this goal,
                      technology-enhanced learning should consider:
                    </p>
                    <ul className="list-disc pl-5 text-gray-600">
                      <li>
                        Developing and applying guidelines for selecting and
                        implementing learning technology tools that actively
                        promote considerations regarding data storage, data
                        lifecycles, information security, and privacy.
                      </li>
                      <li>
                        Developing and implementing a set of Ethical Guidelines
                        for Educational Technology and supporting the
                        post-secondary system in implementing accessibility
                        standards and legislation.
                      </li>
                      <li>
                        Adopting current and emerging best practices to increase
                        equity, diversity, inclusion, and safety in digital
                        spaces.
                      </li>
                    </ul>
                    <p className="text-gray-600 mt-4">
                      Further actions could include identifying and addressing
                      inappropriate behaviour in digital spaces, implementing a
                      code of conduct for online events, and offering training
                      for learners, educators, and staff on identifying and
                      preventing harassment in the digital environment.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-row justify-end mb-4">
            <Button
              onClick={() => setIsAddCriteriaModalOpen(true)}
              className=" gap-2"
            >
              <Plus className="h-4 w-4" /> Add Sub-Criteria
            </Button>
          </div>
          {/* Add Criteria Modal */}
          <Dialog
            open={isAddCriteriaModalOpen}
            onOpenChange={setIsAddCriteriaModalOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Sub-Criteria</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Enter sub-criteria name"
                value={newCriteriaName}
                onChange={(e) => setNewCriteriaName(e.target.value)}
                className="mb-4"
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddCriteriaModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={addNewCriteria}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {criteriaList.length > 0 ? (
            criteriaList.map((criteria) => (
              <Card key={criteria.id} className="mb-6">
                <CardHeader className="flex flex-row justify-between items-center">
                  {editingCriteria === criteria.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingCriteriaName}
                        onChange={(e) => setEditingCriteriaName(e.target.value)}
                        className="w-64"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCriteriaNameEdit}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCriteria(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle>{criteria.name}</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditingCriteria(criteria.id);
                              setEditingCriteriaName(criteria.name);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" /> Edit Name
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => removeCriteria(criteria.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Criteria
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  <div className="flex flex-row">
                    <Button
                      onClick={() => addNewGuidelineForCriteria(criteria.id)}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" /> Add Guideline
                    </Button>
                    <Button
                      onClick={() => toggleCollapse(criteria.id)} // Toggle collapse
                      className="ml-4"
                    >
                      {collapsedCriteria.has(criteria.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Only show guidelines if the criteria is not collapsed */}
                  {!collapsedCriteria.has(criteria.id) &&
                  criteria.guidelines.length > 0 ? (
                    criteria.guidelines.map((guideline) => (
                      <div
                        key={guideline.id}
                        className="mb-4 border p-4 border-gray-200 rounded-md"
                      >
                        {editingGuideline.criteriaId === criteria.id &&
                        editingGuideline.guidelineId === guideline.id ? (
                          <>
                            <Input
                              placeholder="Guideline Header"
                              value={guideline.header}
                              onChange={(e) =>
                                handleHeaderChange(
                                  criteria.id,
                                  guideline.id,
                                  e.target.value
                                )
                              }
                              className="mb-4 text-lg font-semibold"
                            />
                            <Textarea
                              ref={(el) => {
                                if (el) {
                                  textareaRefs.current[`${guideline.id}-body`] =
                                    el;
                                }
                              }}
                              placeholder="Enter guideline details with bullet points (•, *, -)"
                              value={guideline.body}
                              onChange={(e) =>
                                handleBodyChange(
                                  criteria.id,
                                  guideline.id,
                                  e.target.value
                                )
                              }
                              className="w-full min-h-[200px]"
                            />
                            <div className="flex justify-end mt-2">
                              <Button
                                onClick={() =>
                                  finalizeGuideline(criteria.id, guideline.id)
                                }
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
                                  onClick={() =>
                                    setEditingGuideline({
                                      criteriaId: criteria.id,
                                      guidelineId: guideline.id,
                                    })
                                  }
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  onClick={() =>
                                    removeGuideline(criteria.id, guideline.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              ref={(el) => {
                                if (el) {
                                  textareaRefs.current[`${guideline.id}-body`] =
                                    el;
                                }
                              }}
                              placeholder="Enter guideline details"
                              value={guideline.body}
                              onChange={(e) =>
                                handleBodyChange(
                                  criteria.id,
                                  guideline.id,
                                  e.target.value
                                )
                              }
                              disabled={
                                editingGuideline.criteriaId !== criteria.id ||
                                editingGuideline.guidelineId !== guideline.id
                              }
                              className={`w-full min-h-[200px] ${
                                editingGuideline.criteriaId === criteria.id &&
                                editingGuideline.guidelineId === guideline.id
                                  ? ""
                                  : "text-gray-900 bg-gray-100"
                              } ${
                                !editingGuideline.criteriaId === criteria.id &&
                                !editingGuideline.guidelineId === guideline.id
                                  ? "text-gray-500"
                                  : ""
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div>
                      {!collapsedCriteria.has(criteria.id) && (
                        <p className="text-gray-600 text-center">
                          No guidelines available for this criteria. Click{" "}
                          {"Add Guideline"} to start.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-gray-600 text-center">
              No criteria available. Click "Add Criteria" to start.
            </p>
          )}
          <div className="fixed bottom-8 right-8">
            <Button
              size="lg"
              onClick={saveGuidelines}
              disabled={criteriaList.length === 0}
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
