<?php

$pc = test_input($_POST["pc"]);
$pl = test_input($_POST["pl"]);
if (include_once 'DBConnect.php') {
    $sql = "DELETE FROM playerinfo WHERE playername = '$pl' && playercharacter = '$pc'";
    if ($conn->query($sql) === FALSE) {
        echo "Error: " . $sql . "<br>" . $conn->error;
    }
}

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}

$conn->close();
?>

