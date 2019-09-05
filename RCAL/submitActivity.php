<?php

$activityName = "";
$category = "";
$activityType = "";
$discription = "";
$activityNameErr = "";
$categoryErr = "";
$activityTypeErr = "";
$discriptionErr = "";
$allow_to_input = TRUE;
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (empty($_POST["activityname"])) {
        $activityNameErr = "Activity name is required";
        $allow_to_input = FALSE;
    } else {
        $activityName = test_input($_POST["activityname"]);
        $allow_to_input = TRUE;
// check if name only contains letters and whitespace
        if (!preg_match("/^[a-zA-Z ]*$/", $activityName)) {
            $activityNameErr = "Only letters and white space allowed";
            $allow_to_input = FALSE;
        }
    }
    if (empty($_POST["category"])) {
        $categoryErr = "Category is required";
        $allow_to_input = FALSE;
    } else {
        $category = test_input($_POST["category"]);
        $allow_to_input = TRUE;
// check if name only contains letters and whitespace
        if (!preg_match("/^[a-zA-Z ]*$/", $category)) {
            $categoryErr = "Only letters and white space allowed";
            $allow_to_input = FALSE;
        }
    }
    if (empty($_POST["activitytype"])) {
        $activityTypeErr = "Activity type is required";
        $allow_to_input = FALSE;
    } else {
        $activityType = test_input($_POST["activitytype"]);
        $allow_to_input = TRUE;
// check if name only contains letters and whitespace
        if (!preg_match("/^[a-zA-Z ]*$/", $activityType)) {
            $activityTypeErr = "Only letters and white space allowed";
            $allow_to_input = FALSE;
        }
    }
    if (empty($_POST["discription"])) {
        $discriptionErr = "Discription is required";
        $allow_to_input = FALSE;
    } else {
        $discription = test_input($_POST["activityname"]);
        $allow_to_input = TRUE;
// check if name only contains letters and whitespace
        if (!preg_match("/^[a-zA-Z ]*$/", $activityName)) {
            $discriptionErr = "Only letters and white space allowed";
            $allow_to_input = FALSE;
        }
    }

    if ($allow_to_input == TRUE) {
        if (include 'DBConnect.php') {
            $sql = "INSERT INTO activity (activity_name, description, category, activity_type, state) "
                    . "VALUES ('$activityName', '$discription', '$category', '$activityType', 'wait for approve')";
            if ($conn->query($sql) === FALSE) {
                echo "Error: " . $sql . "<br>" . $conn->error;
            }
        }
            header("Location:activity.php");
        $conn->close();
    }
}
?>