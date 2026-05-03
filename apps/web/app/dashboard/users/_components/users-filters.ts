import { DataTableFilterField } from "@/app/components/data-table/types";

export function getUserFilterFields(): DataTableFilterField[] {
    return [
        {
            key: "search",
            label: "Search",
            type: "text",
            placeholder: "Search by name or email",
        },
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { label: "Active", value: "ACTIVE" },
                { label: "Inactive", value: "INACTIVE" },
                { label: "Suspended", value: "SUSPENDED" },
                { label: "Invited", value: "INVITED" },
            ],
        },
        {
            key: "businessUnitId",
            label: "Business Unit",
            type: "lookup",
            placeholder: "Select business unit",
            lookup: {
                endpoint: "/api/business-units",
                searchParam: "search",
                labelField: "name",
                valueField: "id",
                descriptionField: "code",
            },
        },
        {
            key: "isServiceAccount",
            label: "Service Account",
            type: "select",
            options: [
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
            ],
        },
    ];
}