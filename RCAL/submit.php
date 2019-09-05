<?php
include_once 'topbar.php';
include_once 'submitActivity.php';
?>
<div class="center">
    <div class="row">
        <h1>Submit your ideas</h1>
        <form method="post" name="user_register_submit" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" autocomplete="off" id="user_register"> 
            <hr>
            <input type="text" value="<?php echo $activityName ?>" placeholder="Enter Activity Name" name="activityname"><span class="error"><?php echo $activityNameErr; ?></span>
            <input type="text" value="<?php echo $category ?>" placeholder="Enter Category" name="category"><span class="error"><?php echo $categoryErr; ?></span>
            <input type="text" value="<?php echo $activityType ?>" placeholder="Enter Activity Type" name="activitytype"><span class="error"><?php echo $activityTypeErr; ?></span>
            <textarea style="resize: none; width: 100%" placeholder="Please input some discription for the activity" name="discription"><?php echo $discription ?></textarea><span class="error"><?php echo $discriptionErr; ?></span>
            <br>
            <hr>
            <input type="submit" value="Submit" name="activity_submit">
        </form>
    </div>
</div>
</body>
</html>