<?php
include 'DBConnect.php';
$pic_name = "";
$pic_nameErr = "";
if (isset($_POST['but_upload'])) {
    $upload = TRUE;
    if (empty($_POST["pic_name"])) {
        $pic_nameErr = "Player's name is required";
        $upload = FALSE;
    } else {
        $pic_name = test_input($_POST["pic_name"]);
    }
    if ($upload) {
        $image = $_FILES['file']['name'];
        $target_dir = "pictures/";
        $target_file = $target_dir . basename($_FILES["file"]["name"]);

        // Select file type
        $imageFileType = strtolower(pathinfo($target_file, PATHINFO_EXTENSION));

        // Valid file extensions
        $extensions_arr = array("jpg", "jpeg", "png", "gif");

        // Check extension
        if (in_array($imageFileType, $extensions_arr)) {
            $result = $conn->query("SELECT name FROM pictures WHERE name = '$pic_name'");
            if ($result->num_rows == 0) {
                // Insert record
                $sql = "INSERT into pictures (name,image) VALUES('$pic_name','$image')";

                // Upload file
                move_uploaded_file($_FILES['file']['tmp_name'], $target_dir . $image);
                if ($conn->query($sql) === FALSE) {
                    echo "Error: " . $sql . "<br>" . $conn->error;
                }
            } else {
                echo "Image name exist.";
            }
        }
        $conn->close();
    }
}

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}
?>
<form method="post" action="" enctype='multipart/form-data'>
    圖片名稱: <input type="text" name="pic_name">
    <span class="error">* <?php echo $pic_nameErr; ?></span><br>
    <input type='file' name='file' />
    <input type='submit' value='Save Pictue' name='but_upload'>
</form>